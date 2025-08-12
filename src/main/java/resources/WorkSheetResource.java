package resources;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.logging.Level;
import java.util.logging.Logger;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.cloud.datastore.Datastore;
import com.google.cloud.datastore.DatastoreException;
import com.google.cloud.datastore.DatastoreOptions;
import com.google.cloud.datastore.Entity;
import com.google.cloud.datastore.Key;
import com.google.cloud.datastore.KeyFactory;
import com.google.cloud.datastore.ListValue;
import com.google.cloud.datastore.LongValue;
import com.google.cloud.datastore.Query;
import com.google.cloud.datastore.QueryResults;
import com.google.cloud.datastore.StringValue;
import com.google.cloud.datastore.StructuredQuery;
import com.google.cloud.datastore.StructuredQuery.PropertyFilter;
import com.google.cloud.datastore.Transaction;
import com.google.cloud.datastore.Value;
import com.google.gson.Gson;

import auth.AuthTokenUtil;
import constants.AccountConstants;
import constants.WorkSheetConstants;
import dto.WorkSheetData;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;

@Path("/worksheet")
public class WorkSheetResource {

	private static final String MESSAGE_INVALID_USER = "Incorrect username, please try again.";
	private static final String MESSAGE_INVALID_PERMISSION = "You are not allowed to create worksheets.";
	private static final String MESSAGE_INVALID_ID = "WorkSheet already exists.";

	private static final String MESSAGE_INVALID_WORKSHEET = "WorkSheet not found.";

	private static final String MESSAGE_WORK_SHEET_CREATION_SUCCESSFUL = "WorkSheet created successfully.";
	private static final String MESSAGE_WORK_SHEET_DELETION_SUCCESSFUL = "WorkSheet deleted successfully.";

	private static final String LOG_MESSAGE_CREATE_WORK_SHEET_ATTEMPT = "Create WorkSheet attempt.";
	private static final String LOG_MESSAGE_DELETE_WORK_SHEET_ATTEMPT = "Delete WorkSheet attempt.";
	private static final String LOG_MESSAGE_VIEW_WORK_SHEET_ATTEMPT = "View WorkSheet attempt.";
	private static final String LOG_MESSAGE_DETAILED_VIEW_WORK_SHEET_ATTEMPT = "DetailedView WorkSheet attempt.";

	private static final Logger LOG = Logger.getLogger(LoginResource.class.getName());
	private static final Datastore datastore = DatastoreOptions.getDefaultInstance().getService();
	private static final KeyFactory wsKeyFactory = datastore.newKeyFactory().setKind(WorkSheetConstants.WORKSHEET);

	private final Gson g = new Gson();
	private static final ObjectMapper mapper = new ObjectMapper();

	public WorkSheetResource() {
	}

	@POST
	@Path("/create")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response createWorkSheet(@HeaderParam("Authorization") String authHeader, WorkSheetData data) {
		LOG.info(LOG_MESSAGE_CREATE_WORK_SHEET_ATTEMPT);
		Transaction txn = datastore.newTransaction();
		try {
			if (data.metadata.operations.size() > 5) {
				return Response.status(Status.BAD_REQUEST).entity("Operações acima do máximo (5).").build();
			}
			List<String> createWorkSheetRoles = new ArrayList<>();
			createWorkSheetRoles.add(AccountConstants.SHEET_MANAGER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, createWorkSheetRoles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}
			
			String username = user.getString(AccountConstants.DS_USERNAME);

			long wsId = data.metadata.id;
			Key wsKey = wsKeyFactory.newKey(wsId);
			Entity ws = txn.get(wsKey);
			if (ws != null) {
				txn.rollback();
				return Response.status(Status.CONFLICT).entity(MESSAGE_INVALID_ID).build();
			}

			Entity.Builder worksheetBuilder = Entity.newBuilder(wsKey)
					.set(WorkSheetConstants.WS_STARTING_DATE, data.metadata.starting_date)
					.set(WorkSheetConstants.WS_FINISHING_DATE, data.metadata.finishing_date)
					.set(WorkSheetConstants.WS_ISSUE_DATE, data.metadata.issue_date)
					.set(WorkSheetConstants.WS_AWARD_DATE, data.metadata.award_date)
					.set(WorkSheetConstants.WS_SERVICE_PROVIDER_ID, data.metadata.service_provider_id)
					.set(WorkSheetConstants.WS_ISSUING_USER_ID, data.metadata.issuing_user_id)
					.set(WorkSheetConstants.WS_POSA_CODE, data.metadata.posa_code)
					.set(WorkSheetConstants.WS_POSA_DESCRIPTION, data.metadata.posa_description)
					.set(WorkSheetConstants.WS_POSP_CODE, data.metadata.posp_code)
					.set(WorkSheetConstants.WS_POSP_DESCRIPTION, data.metadata.posp_description)
					.set(WorkSheetConstants.WS_CREATED_AT, new Date().toString());

			ListValue.Builder listBuilder = ListValue.newBuilder();
			data.metadata.aigp.forEach(s -> listBuilder.addValue(StringValue.of(s)));
			ListValue aigpList = listBuilder.build();
			worksheetBuilder.set(WorkSheetConstants.WS_AIGP, aigpList);

			ws = worksheetBuilder.build();
			txn.put(ws);

			for (WorkSheetData.Operation op : data.metadata.operations) {
				Key opKey = datastore.newKeyFactory().setKind(WorkSheetConstants.WS_OPERATION)
						.newKey(wsId + "_" + op.operation_code);
				Entity opEnt = txn.get(opKey);
				Entity.Builder opBuilder = Entity.newBuilder(opKey).set(WorkSheetConstants.WS_OP_WSID, wsId)
						.set(WorkSheetConstants.WS_OP_OPC, op.operation_code)
						.set(WorkSheetConstants.WS_OP_OPD, op.operation_description)
						.set(WorkSheetConstants.WS_OP_AHA, op.area_ha);

				opEnt = opBuilder.build();
				txn.put(opEnt);
			}

			for (WorkSheetData.Feature f : data.features) {
				Key featKey = datastore.newKeyFactory().setKind(WorkSheetConstants.WS_PROP)
						.newKey(f.properties.rural_property_id);
				Entity featEnt = txn.get(featKey);
				StringValue geoVal = StringValue.newBuilder(f.geometry.toString())
						.setExcludeFromIndexes(true)
						.build();
				if (featEnt == null) {
					Entity.Builder featBuilder = Entity.newBuilder(featKey)
							.set(WorkSheetConstants.WS_P_AIGP, f.properties.aigp)
							.set(WorkSheetConstants.WS_P_PID, f.properties.polygon_id)
							.set(WorkSheetConstants.WS_P_UIID, f.properties.UI_id)
							.set(WorkSheetConstants.WS_P_GEOMETRY, geoVal)
							.set(WorkSheetConstants.WS_P_WSW, ListValue.of(wsId));
					featEnt = featBuilder.build();
					txn.put(featEnt);
				} else {
					List<Value<?>> existing = featEnt.getList(WorkSheetConstants.WS_P_WSW);
					ListValue.Builder lvb = ListValue.newBuilder();
					existing.forEach(lvb::addValue);
					lvb.addValue(LongValue.of(wsId));
					ListValue updatedList = lvb.build();
					Entity updatedFeat = Entity.newBuilder(featEnt).set(WorkSheetConstants.WS_P_WSW, updatedList)
							.build();
					txn.update(updatedFeat);
				}
			}

			txn.commit();
			LOG.info(MESSAGE_WORK_SHEET_CREATION_SUCCESSFUL);
			
			// Create notifications for relevant users
			createWorksheetNotifications(wsId, username);
			
			return Response.ok(g.toJson(true)).build();
		} catch (DatastoreException e) {
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity(e.toString()).build();
		} finally {
			if (txn.isActive()) {
				txn.rollback();

			}
		}
	}

	@DELETE
	@Path("/{id}")
	public Response deleteWorkSheet(@PathParam("id") Long id, @HeaderParam("Authorization") String authHeader) {
		LOG.info(LOG_MESSAGE_DELETE_WORK_SHEET_ATTEMPT);
		Transaction txn = datastore.newTransaction();
		try {
			List<String> deleteWorkSheetRoles = new ArrayList<>();
			deleteWorkSheetRoles.add(AccountConstants.SHEET_MANAGER_BACKOFFICE);
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, deleteWorkSheetRoles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			Key worksheetKey = wsKeyFactory.newKey(id);
			Entity worksheet = txn.get(worksheetKey);
			if (worksheet == null) {
				txn.rollback();
				LOG.warning(MESSAGE_INVALID_WORKSHEET);
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_WORKSHEET).build();
			}
			txn.delete(worksheetKey);

			Query<Entity> query = Query.newEntityQueryBuilder().setKind(WorkSheetConstants.WS_OPERATION)
					.setFilter(StructuredQuery.PropertyFilter.eq(WorkSheetConstants.WS_OP_WSID, LongValue.of(id)))
					.build();
			QueryResults<Entity> operations = txn.run(query);
			Entity operationEntity = null;
			while (operations.hasNext()) {
				operationEntity = operations.next();
				txn.delete(operationEntity.getKey());
			}

			Query<Key> keyQuery = Query.newKeyQueryBuilder().setKind(WorkSheetConstants.WS_PROP)
					.setFilter(StructuredQuery.PropertyFilter.eq(WorkSheetConstants.WS_P_WSW, LongValue.of(id)))
					.build();
			QueryResults<Key> keys = txn.run(keyQuery);
			while (keys.hasNext()) {
				Key propKey = keys.next();
				Entity propEnt = txn.get(propKey);
				List<Value<?>> existing = propEnt.getList(WorkSheetConstants.WS_P_WSW);
				ListValue.Builder lvb = ListValue.newBuilder();
				for (Value<?> val : existing) {
					if (!(val instanceof LongValue && ((LongValue) val).get() == id)) {
						lvb.addValue(val);
					}
				}
				ListValue newList = lvb.build();
				Entity updated = Entity.newBuilder(propEnt).set(WorkSheetConstants.WS_P_WSW, newList).build();
				txn.update(updated);
			}
			txn.commit();
			LOG.info(MESSAGE_WORK_SHEET_DELETION_SUCCESSFUL);
			return Response.ok().build();
		} catch (DatastoreException e) {
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity(e.toString()).build();
		} finally {
			if (txn.isActive())
				txn.rollback();
		}
	}

	@GET
	@Path("/{id}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response visualizeWorkSheet(@PathParam("id") Long id, @HeaderParam("Authorization") String authHeader) {
		LOG.info(LOG_MESSAGE_VIEW_WORK_SHEET_ATTEMPT);
		List<String> visualizeWorkSheetRoles = new ArrayList<>();
		visualizeWorkSheetRoles.add(AccountConstants.SHEET_MANAGER_BACKOFFICE);
		visualizeWorkSheetRoles.add(AccountConstants.SHEET_GENERAL_VIEWER_BACKOFFICE);
		visualizeWorkSheetRoles.add(AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE);
		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, visualizeWorkSheetRoles);
		if (user == null) {
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_PERMISSION).build();
		}
		Key worksheetKey = wsKeyFactory.newKey(id);

		Entity worksheet = datastore.get(worksheetKey);
		if (worksheet == null) {
			return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_WORKSHEET).build();
		}
		ObjectNode response = getGeneralInfo(id, worksheet);
		String json;
		try {
			json = mapper.writeValueAsString(response);
		} catch (JsonProcessingException e) {
			LOG.log(Level.SEVERE, "Erro a serializar JSON da worksheet detalhada", e);
			throw new WebApplicationException("Erro interno ao gerar JSON", e, Status.INTERNAL_SERVER_ERROR);
		}
		return Response.ok(json).build();
	}

	@GET
	@Path("/{id}/detailed")
	@Produces(MediaType.APPLICATION_JSON)
	public Response visualizeDetailedWorkSheet(@PathParam("id") Long id,
			@HeaderParam("Authorization") String authHeader) {
		LOG.info(LOG_MESSAGE_DETAILED_VIEW_WORK_SHEET_ATTEMPT);
		List<String> visualizeWorkSheetRoles = new ArrayList<>();
		visualizeWorkSheetRoles.add(AccountConstants.SHEET_MANAGER_BACKOFFICE);
		visualizeWorkSheetRoles.add(AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE);
		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, visualizeWorkSheetRoles);
		if (user == null) {
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_PERMISSION).build();
		}
		Key worksheetKey = wsKeyFactory.newKey(id);
		Entity worksheet = datastore.get(worksheetKey);
		if (worksheet == null) {
			return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_WORKSHEET).build();
		}
		ObjectNode response = getGeneralInfo(id, worksheet);
		response.put(WorkSheetConstants.WS_ISSUING_USER_ID, worksheet.getLong(WorkSheetConstants.WS_ISSUING_USER_ID));
		response.put(WorkSheetConstants.WS_POSA_CODE, worksheet.getString(WorkSheetConstants.WS_POSA_CODE));
		response.put(WorkSheetConstants.WS_POSA_DESCRIPTION,
				worksheet.getString(WorkSheetConstants.WS_POSA_DESCRIPTION));
		response.put(WorkSheetConstants.WS_POSP_CODE, worksheet.getString(WorkSheetConstants.WS_POSP_CODE));

		ArrayNode opsArray = response.putArray("operations");
		Query<Entity> opQuery = Query.newEntityQueryBuilder().setKind(WorkSheetConstants.WS_OPERATION)
				.setFilter(StructuredQuery.PropertyFilter.eq(WorkSheetConstants.WS_OP_WSID, LongValue.of(id))).build();
		datastore.run(opQuery).forEachRemaining(opEntity -> {
			ObjectNode opNode = mapper.createObjectNode();
			opNode.put(WorkSheetConstants.WS_OP_OPC, opEntity.getString(WorkSheetConstants.WS_OP_OPC));
			opNode.put(WorkSheetConstants.WS_OP_OPD, opEntity.getString(WorkSheetConstants.WS_OP_OPD));
			opNode.put(WorkSheetConstants.WS_OP_AHA, opEntity.getDouble(WorkSheetConstants.WS_OP_AHA));
			opsArray.add(opNode);
		});

		ArrayNode rurPropsArray = response.putArray("ruralProperties");
		Query<Entity> rurPropQuery = Query.newEntityQueryBuilder().setKind(WorkSheetConstants.WS_PROP)
				.setFilter(StructuredQuery.PropertyFilter.eq(WorkSheetConstants.WS_P_WSW, LongValue.of(id))).build();
		datastore.run(rurPropQuery).forEachRemaining(rurPropEntity -> {
			ObjectNode rurPropNode = mapper.createObjectNode();
			rurPropNode.put(WorkSheetConstants.WS_P_AIGP, rurPropEntity.getString(WorkSheetConstants.WS_P_AIGP));
			rurPropNode.put("rural_property_id", rurPropEntity.getKey().getName());
			rurPropNode.put(WorkSheetConstants.WS_P_UIID, rurPropEntity.getLong(WorkSheetConstants.WS_P_UIID));
			rurPropNode.put(WorkSheetConstants.WS_P_PID, rurPropEntity.getLong(WorkSheetConstants.WS_P_PID));
			rurPropNode.set(WorkSheetConstants.WS_P_GEOMETRY,
					safeParse(rurPropEntity.getString(WorkSheetConstants.WS_P_GEOMETRY)));
			rurPropsArray.add(rurPropNode);
		});
		String json;
		try {
			json = mapper.writeValueAsString(response);
		} catch (JsonProcessingException e) {
			LOG.log(Level.SEVERE, "Erro a serializar JSON da worksheet detalhada", e);
			throw new WebApplicationException("Erro interno ao gerar JSON", e, Status.INTERNAL_SERVER_ERROR);
		}
		return Response.ok(json).build();
	}

	@GET
	@Path("/list")
	@Produces(MediaType.APPLICATION_JSON)
	public Response listWorkSheets(@HeaderParam("Authorization") String authHeader) {
		LOG.info("List WorkSheets attempt.");

		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				LOG.warning(MESSAGE_INVALID_USER);
				return Response.status(Status.UNAUTHORIZED)
						.entity(MESSAGE_INVALID_USER)
						.build();
			}

			// Query all worksheets
			Query<Entity> query = Query.newEntityQueryBuilder()
					.setKind(WorkSheetConstants.WORKSHEET)
					.build();

			QueryResults<Entity> results = datastore.run(query);

			List<Long> worksheetIds = new ArrayList<>();
			while (results.hasNext()) {
				Entity ws = results.next();
				worksheetIds.add(ws.getKey().getId());
			}

			return Response.ok(worksheetIds).build();

		} catch (Exception e) {
			LOG.severe("Error listing worksheets: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR)
					.entity("Error listing worksheets: " + e.getMessage())
					.build();
		}
	}

	private ObjectNode getGeneralInfo(Long id, Entity ws) {
		ObjectNode node = mapper.createObjectNode();
		node.put("id", id);
		ArrayNode a = node.putArray(WorkSheetConstants.WS_AIGP);
		ws.getList(WorkSheetConstants.WS_AIGP).forEach(v -> a.add(((StringValue) v).get()));
		node.put(WorkSheetConstants.WS_STARTING_DATE, ws.getString(WorkSheetConstants.WS_STARTING_DATE));
		node.put(WorkSheetConstants.WS_FINISHING_DATE, ws.getString(WorkSheetConstants.WS_FINISHING_DATE));
		node.put(WorkSheetConstants.WS_ISSUE_DATE, ws.getString(WorkSheetConstants.WS_ISSUE_DATE));
		node.put(WorkSheetConstants.WS_AWARD_DATE, ws.getString(WorkSheetConstants.WS_AWARD_DATE));
		node.put(WorkSheetConstants.WS_SERVICE_PROVIDER_ID, ws.getLong(WorkSheetConstants.WS_SERVICE_PROVIDER_ID));
		node.put(WorkSheetConstants.WS_POSP_DESCRIPTION, ws.getString(WorkSheetConstants.WS_POSP_DESCRIPTION));
		return node;
	}

	private JsonNode safeParse(String json) {
		try {
			return mapper.readTree(json);
		} catch (IOException e) {
			throw new WebApplicationException("Invalid geometry JSON", e, Status.INTERNAL_SERVER_ERROR);
		}
	}
	
	// Helper method to create notifications for worksheet creation
	private void createWorksheetNotifications(long wsId, String createdBy) {
		try {
			// Get all users who should be notified about new worksheets
			Query<Entity> query = Query.newEntityQueryBuilder()
					.setKind(AccountConstants.USER)
					.setFilter(PropertyFilter.eq(AccountConstants.DS_STATE, AccountConstants.ACTIVE_STATE))
					.build();
			
			QueryResults<Entity> results = datastore.run(query);
			
			while (results.hasNext()) {
				Entity user = results.next();
				String username = user.getString(AccountConstants.DS_USERNAME);
				String role = user.getString(AccountConstants.DS_ROLE);
				
				// Notify relevant users (managers, admins, etc.)
				if (role.equals(AccountConstants.SHEET_MANAGER_BACKOFFICE) || 
					role.equals(AccountConstants.SYSTEM_ADMIN_ROLE) ||
					role.equals(AccountConstants.SYSTEM_BACKOFFICE_ROLE)) {
					
					NotificationResource.createNotification(
						username,
						createdBy,
						"worksheet_added",
						"Nova Worksheet Criada",
						createdBy + " criou uma nova worksheet #" + wsId,
						String.valueOf(wsId)
					);
				}
			}
		} catch (Exception e) {
			LOG.severe("Error creating worksheet notifications: " + e.getMessage());
		}
	}
}
