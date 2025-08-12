package resources;

import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.cloud.Timestamp;
import com.google.cloud.datastore.Datastore;
import com.google.cloud.datastore.DatastoreOptions;
import com.google.cloud.datastore.Entity;
import com.google.cloud.datastore.Key;
import com.google.cloud.datastore.Query;
import com.google.cloud.datastore.QueryResults;
import com.google.cloud.datastore.StructuredQuery.CompositeFilter;
import com.google.cloud.datastore.StructuredQuery.PropertyFilter;
import com.google.cloud.datastore.Transaction;

import auth.AuthTokenUtil;
import constants.AccountConstants;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;

@Path("/notifications")
public class NotificationResource {

	private static final Logger LOG = Logger.getLogger(NotificationResource.class.getName());
	private static final Datastore datastore = DatastoreOptions.getDefaultInstance().getService();
	private static final ObjectMapper mapper = new ObjectMapper();

	public NotificationResource() {
	}

	@GET
	@Produces(MediaType.APPLICATION_JSON)
	public Response getNotifications(@HeaderParam("Authorization") String authHeader) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity("Invalid user").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// Get notifications for the user (without complex ordering to avoid index issues)
			Query<Entity> query = Query.newEntityQueryBuilder()
					.setKind("Notification")
					.setFilter(PropertyFilter.eq("targetUser", username))
					.setLimit(50)
					.build();

			QueryResults<Entity> results = datastore.run(query);
			ArrayNode notifications = mapper.createArrayNode();
			
			// Collect all notifications first
			List<Entity> notificationList = new ArrayList<>();
			while (results.hasNext()) {
				notificationList.add(results.next());
			}
			
			// Sort by timestamp descending (most recent first)
			notificationList.sort((a, b) -> {
				Timestamp aTime = a.getTimestamp("timestamp");
				Timestamp bTime = b.getTimestamp("timestamp");
				return bTime.compareTo(aTime); // Descending order
			});

			for (Entity notification : notificationList) {
				ObjectNode notificationNode = mapper.createObjectNode();
				
				try {
					notificationNode.put("id", notification.getKey().getName());
					
					// Safely get string fields with null checks
					if (notification.contains("type")) {
						notificationNode.put("type", notification.getString("type"));
					} else {
						notificationNode.put("type", "system");
					}
					
					if (notification.contains("title")) {
						notificationNode.put("title", notification.getString("title"));
					} else {
						notificationNode.put("title", "Notificação");
					}
					
					if (notification.contains("message")) {
						notificationNode.put("message", notification.getString("message"));
					} else {
						notificationNode.put("message", "Nova notificação");
					}
					
					if (notification.contains("fromUser")) {
						notificationNode.put("fromUser", notification.getString("fromUser"));
					} else {
						notificationNode.put("fromUser", "Sistema");
					}
					
					if (notification.contains("timestamp")) {
						notificationNode.put("timestamp", notification.getTimestamp("timestamp").toString());
					} else {
						notificationNode.put("timestamp", new java.util.Date().toString());
					}
					
					if (notification.contains("read")) {
						notificationNode.put("read", notification.getBoolean("read"));
					} else {
						notificationNode.put("read", false);
					}
					
					if (notification.contains("relatedId")) {
						notificationNode.put("relatedId", notification.getString("relatedId"));
					}
					
					notifications.add(notificationNode);
				} catch (Exception notificationError) {
					LOG.warning("Error processing notification " + notification.getKey().getName() + ": " + notificationError.getMessage());
					// Skip this notification and continue with others
					continue;
				}
			}

			return Response.ok(mapper.writeValueAsString(notifications)).build();

		} catch (Exception e) {
			LOG.severe("Error getting notifications: " + e.getMessage());
			e.printStackTrace();
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting notifications: " + e.getMessage()).build();
		}
	}

	@POST
	@Path("/{id}/read")
	@Produces(MediaType.APPLICATION_JSON)
	public Response markAsRead(@PathParam("id") String notificationId, @HeaderParam("Authorization") String authHeader) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity("Invalid user").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);
			
			Key notificationKey = datastore.newKeyFactory().setKind("Notification").newKey(notificationId);
			Entity notification = txn.get(notificationKey);

			if (notification == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity("Notification not found").build();
			}

			// Check if notification belongs to user
			if (!notification.getString("targetUser").equals(username)) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity("Access denied").build();
			}

			// Update notification as read
			Entity updatedNotification = Entity.newBuilder(notification)
					.set("read", true)
					.build();
			
			txn.update(updatedNotification);
			txn.commit();

			return Response.ok("{\"success\": true}").build();

		} catch (Exception e) {
			if (txn.isActive()) {
				txn.rollback();
			}
			LOG.severe("Error marking notification as read: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error updating notification").build();
		}
	}

	@POST
	@Path("/mark-all-read")
	@Produces(MediaType.APPLICATION_JSON)
	public Response markAllAsRead(@HeaderParam("Authorization") String authHeader) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity("Invalid user").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// Get all unread notifications for the user
			Query<Entity> query = Query.newEntityQueryBuilder()
					.setKind("Notification")
					.setFilter(CompositeFilter.and(
						PropertyFilter.eq("targetUser", username),
						PropertyFilter.eq("read", false)
					))
					.build();

			QueryResults<Entity> results = txn.run(query);
			int updatedCount = 0;

			while (results.hasNext()) {
				Entity notification = results.next();
				Entity updatedNotification = Entity.newBuilder(notification)
						.set("read", true)
						.build();
				txn.update(updatedNotification);
				updatedCount++;
			}

			txn.commit();

			ObjectNode response = mapper.createObjectNode();
			response.put("success", true);
			response.put("updatedCount", updatedCount);

			return Response.ok(mapper.writeValueAsString(response)).build();

		} catch (Exception e) {
			if (txn.isActive()) {
				txn.rollback();
			}
			LOG.severe("Error marking all notifications as read: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error updating notifications").build();
		}
	}

	@DELETE
	@Path("/{id}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response deleteNotification(@PathParam("id") String notificationId, @HeaderParam("Authorization") String authHeader) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity("Invalid user").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);
			
			Key notificationKey = datastore.newKeyFactory().setKind("Notification").newKey(notificationId);
			Entity notification = txn.get(notificationKey);

			if (notification == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity("Notification not found").build();
			}

			// Check if notification belongs to user
			if (!notification.getString("targetUser").equals(username)) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity("Access denied").build();
			}

			// Delete notification
			txn.delete(notificationKey);
			txn.commit();

			return Response.ok("{\"success\": true}").build();

		} catch (Exception e) {
			if (txn.isActive()) {
				txn.rollback();
			}
			LOG.severe("Error deleting notification: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error deleting notification").build();
		}
	}

	@DELETE
	@Path("/clear-all")
	@Produces(MediaType.APPLICATION_JSON)
	public Response clearAllNotifications(@HeaderParam("Authorization") String authHeader) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity("Invalid user").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// Get all notifications for the user
			Query<Entity> query = Query.newEntityQueryBuilder()
					.setKind("Notification")
					.setFilter(PropertyFilter.eq("targetUser", username))
					.build();

			QueryResults<Entity> results = txn.run(query);
			int deletedCount = 0;

			while (results.hasNext()) {
				Entity notification = results.next();
				txn.delete(notification.getKey());
				deletedCount++;
			}

			txn.commit();

			ObjectNode response = mapper.createObjectNode();
			response.put("success", true);
			response.put("deletedCount", deletedCount);

			return Response.ok(mapper.writeValueAsString(response)).build();

		} catch (Exception e) {
			if (txn.isActive()) {
				txn.rollback();
			}
			LOG.severe("Error clearing all notifications: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error clearing notifications").build();
		}
	}



	@GET
	@Path("/count/unread")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getUnreadCount(@HeaderParam("Authorization") String authHeader) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity("Invalid user").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			Query<Entity> query = Query.newEntityQueryBuilder()
					.setKind("Notification")
					.setFilter(CompositeFilter.and(
						PropertyFilter.eq("targetUser", username),
						PropertyFilter.eq("read", false)
					))
					.build();

			QueryResults<Entity> results = datastore.run(query);
			
			int count = 0;
			while (results.hasNext()) {
				results.next();
				count++;
			}

			ObjectNode response = mapper.createObjectNode();
			response.put("unreadCount", count);

			return Response.ok(mapper.writeValueAsString(response)).build();

		} catch (Exception e) {
			LOG.severe("Error getting unread count: " + e.getMessage());
			e.printStackTrace();
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting unread count: " + e.getMessage()).build();
		}
	}

	// Helper method to create notifications (called from other resources)
	public static void createNotification(String targetUser, String fromUser, String type, String title, String message, String relatedId) {
		try {
			// Skip notification creation if targetUser is null (for broadcast notifications)
			if (targetUser == null) {
				Logger.getLogger(NotificationResource.class.getName()).info("Skipping notification creation - targetUser is null (broadcast notification)");
				return;
			}
			
			// Validate required parameters
			if (targetUser == null || targetUser.isEmpty()) {
				Logger.getLogger(NotificationResource.class.getName()).warning("Cannot create notification: targetUser is null or empty");
				return;
			}
			
			if (fromUser == null || fromUser.isEmpty()) {
				fromUser = "Sistema";
			}
			
			if (type == null || type.isEmpty()) {
				type = "system";
			}
			
			if (title == null || title.isEmpty()) {
				title = "Nova Notificação";
			}
			
			if (message == null || message.isEmpty()) {
				message = "Você tem uma nova notificação";
			}
			
			String notificationId = targetUser + "_" + System.currentTimeMillis();
			Key notificationKey = DatastoreOptions.getDefaultInstance().getService()
					.newKeyFactory().setKind("Notification").newKey(notificationId);

			Entity.Builder builder = Entity.newBuilder(notificationKey)
					.set("targetUser", targetUser)
					.set("fromUser", fromUser)
					.set("type", type)
					.set("title", title)
					.set("message", message)
					.set("timestamp", Timestamp.now())
					.set("read", false);

			if (relatedId != null && !relatedId.isEmpty()) {
				builder.set("relatedId", relatedId);
			}

			DatastoreOptions.getDefaultInstance().getService().put(builder.build());
			
			Logger.getLogger(NotificationResource.class.getName()).info("Notification created successfully for user: " + targetUser);

		} catch (Exception e) {
			Logger.getLogger(NotificationResource.class.getName()).severe("Error creating notification: " + e.getMessage());
			e.printStackTrace();
		}
	}

	// Helper method to create broadcast notifications (for system-wide notifications)
	public static void createBroadcastNotification(String fromUser, String type, String title, String message, String relatedId) {
		try {
			// Get all active users
			Query<Entity> query = Query.newEntityQueryBuilder()
					.setKind(AccountConstants.USER)
					.setFilter(PropertyFilter.eq(AccountConstants.DS_STATE, AccountConstants.ACTIVE_STATE))
					.build();

			QueryResults<Entity> results = DatastoreOptions.getDefaultInstance().getService().run(query);

			while (results.hasNext()) {
				Entity user = results.next();
				String username = user.getString(AccountConstants.DS_USERNAME);
				
				// Create notification for each user
				createNotification(username, fromUser, type, title, message, relatedId);
			}

		} catch (Exception e) {
			Logger.getLogger(NotificationResource.class.getName()).severe("Error creating broadcast notification: " + e.getMessage());
		}
	}
}