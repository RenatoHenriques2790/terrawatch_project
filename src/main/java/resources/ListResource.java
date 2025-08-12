package resources;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.appengine.repackaged.com.google.protobuf.StringValue;
import com.google.cloud.datastore.Datastore;
import com.google.cloud.datastore.DatastoreOptions;
import com.google.cloud.datastore.Entity;
import com.google.cloud.datastore.ListValue;
import com.google.cloud.datastore.Query;
import com.google.cloud.datastore.QueryResults;
import com.google.cloud.datastore.StructuredQuery;
import com.google.gson.Gson;

import auth.AuthTokenUtil;
import constants.AccountConstants;
import constants.ExecutionSheetConstants;
import constants.WorkSheetConstants;
import dto.ListUsersData;
import dto.UserDto;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;

@Path("/list")
public class ListResource {

	private static final String MESSAGE_INVALID_TOKEN = "Invalid or expired token.";
	private static final String MESSAGE_NO_PERMISSION = "You do not have permission to list users.";

	private static final String LOG_MESSAGE_LIST_USERS_ATTEMPT = "List users attempt by: ";
	private static final String LOG_MESSAGE_LIST_USERS_SUCCESSFUL = "List users attempt successful by: ";

	private static final Logger LOG = Logger.getLogger(ListResource.class.getName());
	private static final Datastore datastore = DatastoreOptions.getDefaultInstance().getService();

	private final Gson g = new Gson();

	public ListResource() {
	}

	private String getValueOrDefault(Entity entity, String property, String defaultVal) {
		if (entity.contains(property)) {
			String val = entity.getString(property);
			if (val == null || val.trim().isEmpty()) {
				return defaultVal;
			}
			return val;
		}
		return defaultVal;
	}

	@POST
	@Path("/users")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response listUsers(@HeaderParam("Authorization") String authHeader, ListUsersData data) {
		LOG.fine(LOG_MESSAGE_LIST_USERS_ATTEMPT + data.username);

		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);
		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}

		String requesterRole = user.getString(AccountConstants.DS_ROLE);
		Query<Entity> query;

		if (requesterRole.equals(AccountConstants.SYSTEM_ADMIN_ROLE)
				|| requesterRole.equals(AccountConstants.SYSTEM_BACKOFFICE_ROLE)) {
			query = Query.newEntityQueryBuilder().setKind(AccountConstants.USER).build();
		} else {
			query = Query.newEntityQueryBuilder().setKind(AccountConstants.USER)
					.setFilter(StructuredQuery.CompositeFilter.and(
							StructuredQuery.PropertyFilter.eq(AccountConstants.DS_PROFILE,
									AccountConstants.PUBLIC_PROFILE),
							StructuredQuery.PropertyFilter.eq(AccountConstants.DS_STATE,
									AccountConstants.ACTIVE_STATE)))
					.build();
		}

		QueryResults<Entity> results = datastore.run(query);
		List<UserDto> usersList = new ArrayList<>();

		while (results.hasNext()) {
			Entity userEntity = results.next();
			UserDto userDto = new UserDto();
			userDto.username = userEntity.getKey().getName();
			if (AccountConstants.SYSTEM_ADMIN_ROLE.equalsIgnoreCase(requesterRole) || AccountConstants.SYSTEM_BACKOFFICE_ROLE.equals(requesterRole)) {
				userDto.email = getValueOrDefault(userEntity, AccountConstants.DS_EMAIL, "NOT DEFINED");
				userDto.name = getValueOrDefault(userEntity, AccountConstants.DS_FULLNAME, "NOT DEFINED");
				userDto.role = getValueOrDefault(userEntity, AccountConstants.DS_ROLE, "NOT DEFINED");
				userDto.pn = getValueOrDefault(userEntity, AccountConstants.DS_PN, "NOT DEFINED");
				userDto.pr = getValueOrDefault(userEntity, AccountConstants.DS_PR, "NOT DEFINED");
				userDto.end = getValueOrDefault(userEntity, AccountConstants.DS_END, "NOT DEFINED");
				userDto.endcp = getValueOrDefault(userEntity, AccountConstants.DS_ENDCP, "NOT DEFINED");
				userDto.phone1 = getValueOrDefault(userEntity, AccountConstants.DS_PHONE1, "NOT DEFINED");
				userDto.phone2 = getValueOrDefault(userEntity, AccountConstants.DS_PHONE2, "NOT DEFINED");
				userDto.nif = getValueOrDefault(userEntity, AccountConstants.DS_NIF, "NOT DEFINED");
				userDto.cc = getValueOrDefault(userEntity, AccountConstants.DS_CC, "NOT DEFINED");
				userDto.ccde = getValueOrDefault(userEntity, AccountConstants.DS_CCDE, "NOT DEFINED");
				userDto.ccle = getValueOrDefault(userEntity, AccountConstants.DS_CCLE, "NOT DEFINED");
				userDto.ccv = getValueOrDefault(userEntity, AccountConstants.DS_CCV, "NOT DEFINED");
				userDto.profile = getValueOrDefault(userEntity, AccountConstants.DS_PROFILE, "NOT DEFINED");
				userDto.state = getValueOrDefault(userEntity, AccountConstants.DS_STATE, "NOT DEFINED");
				userDto.dnasc = getValueOrDefault(userEntity, AccountConstants.DS_DNASC, "NOT DEFINED");
			} else {
				userDto.email = getValueOrDefault(userEntity, AccountConstants.DS_EMAIL, "NOT DEFINED");
				userDto.name = getValueOrDefault(userEntity, AccountConstants.DS_FULLNAME, "NOT DEFINED");
			}
			usersList.add(userDto);
		}

		LOG.info(LOG_MESSAGE_LIST_USERS_SUCCESSFUL + data.username);
		String jsonResponse = g.toJson(usersList);
		return Response.ok(jsonResponse).build();
	}
	
	@GET
	@Path("/parcelsList")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getPolygonsList(@HeaderParam("Authorization") String authHeader) {
		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);
		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}
		Query<Entity> query = Query.newEntityQueryBuilder().setKind(WorkSheetConstants.WS_PROP).build();
		QueryResults<Entity> results = datastore.run(query);
		List<String> polygons = new ArrayList<>();
		while(results.hasNext()) {
			Entity polygonEntity = results.next();
			ObjectNode parcel = new ObjectMapper().createObjectNode();
			parcel.put("id", polygonEntity.getKey().getName());
			parcel.put("geometry", polygonEntity.getString(WorkSheetConstants.WS_P_GEOMETRY));
			parcel.put("worksheets_worked", polygonEntity.getList(WorkSheetConstants.WS_P_WSW).toString());
			polygons.add(g.toJson(parcel));
		}
		String jsonResponse = g.toJson(polygons);
		return Response.ok(jsonResponse).build();
	}
	@GET
	@Path("/parcels")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getPolygons(@HeaderParam("Authorization") String authHeader) {
		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);
		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}
		Query<Entity> query = Query.newEntityQueryBuilder().setKind(WorkSheetConstants.WS_PROP).build();
		QueryResults<Entity> results = datastore.run(query);
		Map<Long, String> polygons = new HashMap<>();
		while(results.hasNext()) {
			Entity polygonEntity = results.next();
			polygons.put(polygonEntity.getLong(WorkSheetConstants.WS_P_PID), polygonEntity.getString(WorkSheetConstants.WS_P_GEOMETRY));
		}
		String jsonResponse = g.toJson(polygons);
		return Response.ok(jsonResponse).build();
	}
	
	@GET
	@Path("/parcelsExec/{id}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getPolygonsExec(@HeaderParam("Authorization") String authHeader, @PathParam("id") String operatorId) {
		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);
		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}
		Query<Entity> query = Query.newEntityQueryBuilder().setKind(ExecutionSheetConstants.EXEC_PARCEL)
				.setFilter(StructuredQuery.PropertyFilter.in(ExecutionSheetConstants.EP_OPERATORS, ListValue.of(operatorId))).build();
		QueryResults<Entity> results = datastore.run(query);
		List<String> polygons = new ArrayList<>();
		while(results.hasNext()) {
			Entity polygonEntity = results.next();
			polygons.add(polygonEntity.getKey().getName());
		}
		String jsonResponse = g.toJson(polygons);
		return Response.ok(jsonResponse).build();
	}
	
	@POST
	@Path("/usersToRemove")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response listUsersToRemove(@HeaderParam("Authorization") String authHeader, ListUsersData data) {
		LOG.fine(LOG_MESSAGE_LIST_USERS_ATTEMPT + data.username);

		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);
		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}

		String requesterRole = user.getString(AccountConstants.DS_ROLE);
		boolean allowed = requesterRole.equals(AccountConstants.SYSTEM_ADMIN_ROLE)
				|| requesterRole.equals(AccountConstants.SYSTEM_BACKOFFICE_ROLE);

		if (!allowed) {
			LOG.warning("User has no permissions: " + data.username);
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_NO_PERMISSION).build();
		}

		Query<Entity> query = Query.newEntityQueryBuilder().setKind(AccountConstants.USER)
				.setFilter(
						StructuredQuery.PropertyFilter.eq(AccountConstants.DS_STATE, AccountConstants.TO_REMOVE_STATE))
				.build();

		QueryResults<Entity> results = datastore.run(query);
		List<UserDto> usersList = new ArrayList<>();

		while (results.hasNext()) {
			Entity userEntity = results.next();
			UserDto userDto = new UserDto();
			userDto.username = userEntity.getKey().getName();
			userDto.email = getValueOrDefault(userEntity, AccountConstants.DS_EMAIL, "NOT DEFINED");
			userDto.name = getValueOrDefault(userEntity, AccountConstants.DS_FULLNAME, "NOT DEFINED");
			userDto.pn = getValueOrDefault(userEntity, AccountConstants.DS_PN, "NOT DEFINED");
			userDto.pr = getValueOrDefault(userEntity, AccountConstants.DS_PR, "NOT DEFINED");
			userDto.end = getValueOrDefault(userEntity, AccountConstants.DS_END, "NOT DEFINED");
			userDto.endcp = getValueOrDefault(userEntity, AccountConstants.DS_ENDCP, "NOT DEFINED");
			userDto.phone1 = getValueOrDefault(userEntity, AccountConstants.DS_PHONE1, "NOT DEFINED");
			userDto.phone2 = getValueOrDefault(userEntity, AccountConstants.DS_PHONE2, "NOT DEFINED");
			userDto.nif = getValueOrDefault(userEntity, AccountConstants.DS_NIF, "NOT DEFINED");
			userDto.cc = getValueOrDefault(userEntity, AccountConstants.DS_CC, "NOT DEFINED");
			userDto.ccde = getValueOrDefault(userEntity, AccountConstants.DS_CCDE, "NOT DEFINED");
			userDto.ccle = getValueOrDefault(userEntity, AccountConstants.DS_CCLE, "NOT DEFINED");
			userDto.ccv = getValueOrDefault(userEntity, AccountConstants.DS_CCV, "NOT DEFINED");
			userDto.name = getValueOrDefault(userEntity, AccountConstants.DS_FULLNAME, "NOT DEFINED");
			userDto.profile = getValueOrDefault(userEntity, AccountConstants.DS_PROFILE, "NOT DEFINED");
			userDto.state = getValueOrDefault(userEntity, AccountConstants.DS_STATE, "NOT DEFINED");
			userDto.dnasc = getValueOrDefault(userEntity, AccountConstants.DS_DNASC, "NOT DEFINED");
			usersList.add(userDto);
		}

		LOG.info(LOG_MESSAGE_LIST_USERS_SUCCESSFUL + data.username);
		String jsonResponse = g.toJson(usersList);
		return Response.ok(jsonResponse).build();
	}
}