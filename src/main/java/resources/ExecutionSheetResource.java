package resources;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

import org.locationtech.proj4j.CRSFactory;
import org.locationtech.proj4j.CoordinateTransform;
import org.locationtech.proj4j.CoordinateTransformFactory;
import org.locationtech.proj4j.ProjCoordinate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.cloud.Timestamp;
import com.google.cloud.datastore.Datastore;
import com.google.cloud.datastore.DatastoreException;
import com.google.cloud.datastore.DatastoreOptions;
import com.google.cloud.datastore.Entity;
import com.google.cloud.datastore.Key;
import com.google.cloud.datastore.KeyFactory;
import com.google.cloud.datastore.ListValue;
import com.google.cloud.datastore.Query;
import com.google.cloud.datastore.QueryResults;
import com.google.cloud.datastore.StringValue;
import com.google.cloud.datastore.StructuredQuery.OrderBy;
import com.google.cloud.datastore.StructuredQuery.PropertyFilter;
import com.google.cloud.datastore.Transaction;
import com.google.cloud.datastore.Value;
import com.google.cloud.storage.Acl;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Bucket;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;
import com.google.gson.Gson;

import auth.AuthTokenUtil;
import constants.AccountConstants;
import constants.ExecutionSheetConstants;
import constants.WorkSheetConstants;
import dto.AddActivityInfoData;
import dto.EditOperationData;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;
import net.sf.geographiclib.Geodesic;
import net.sf.geographiclib.PolygonArea;
import net.sf.geographiclib.PolygonResult;

@Path("/executionsheet")
public class ExecutionSheetResource {

	private static final String MESSAGE_INVALID_USER = "Error: user == null.";
	private static final String MESSAGE_INVALID_WS_ID = "Error: worksheet_id == null";
	private static final String MESSAGE_INVALID_STATUS = "Error: Invalid status.";
	private static final String MESSAGE_INVALID_PARCEL = "Error: Parcel not found.";
	private static final String MESSAGE_INVALID_ACTIVITY = "Error: Activity not found";
	private static final String MESSAGE_EXISTING_EXEC_SHEET = "Error: executionSheet_id != null";
	private static final String MESSAGE_INVALID_PERMISSION = "Error: Permission denied";
	private static final String MESSAGE_INVALID_OPERATION = "Error: Operation not found.";
	private static final String MESSAGE_INVALID_PATH = "Error: Invalid polygon id";
	private static final String MESSAGE_ERROR_CREATING_EXECUTION_SHEET = "Error creating execution sheet: ";
	private static final String MESSAGE_UNASSIGNED_PARCEL = "You are not assigned to this parcel";
	private static final String MESSAGE_UNFINISHED_ACTIVITY = "Error: Activity is not finished.";

	private static final String LOG_MESSAGE_CREATE_EXECUTION_SHEET_ATTEMPT = "Create ExecutionSheet attempt.";
	private static final String LOG_MESSAGE_CREATE_EXECUTION_SHEET_SUCCESSFUL = "Execution sheet created successfully for worksheet: ";
	private static final String LOG_MESSAGE_ASSIGN_OPERATOR_ATTEMPT = "Assign Operator attempt.";
	private static final String LOG_START_ACTIVITY_ATTEMPT = "Start activity attempt.";

	private static final Logger LOG = Logger.getLogger(ExecutionSheetResource.class.getName());
	private static final Datastore datastore = DatastoreOptions.getDefaultInstance().getService();
	private static final KeyFactory wsKeyFactory = datastore.newKeyFactory().setKind(WorkSheetConstants.WORKSHEET);
	private static final KeyFactory esKeyFactory = datastore.newKeyFactory()
			.setKind(ExecutionSheetConstants.EXEC_SHEET);

	private final Gson g = new Gson();
	private static final ObjectMapper mapper = new ObjectMapper();

	public ExecutionSheetResource() {
	}

	@POST
	@Path("/create/{worksheetId}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response createExecutionSheet(@HeaderParam("Authorization") String authHeader,
			@PathParam("worksheetId") Long worksheetId) {
		Transaction txn = datastore.newTransaction();
		try {
			// Allow more roles to create execution sheets
			List<String> roles = List.of(
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE,
					AccountConstants.PARTNER_OPERATOR);

			LOG.fine(LOG_MESSAGE_CREATE_EXECUTION_SHEET_ATTEMPT);
			LOG.info("Attempting to create execution sheet for worksheet: " + worksheetId);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				LOG.warning("User validation failed for execution sheet creation");
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}
			LOG.info("User validated: " + user.getString(AccountConstants.DS_USERNAME));

			Key wsKey = wsKeyFactory.newKey(worksheetId);
			Entity ws = txn.get(wsKey);
			if (ws == null) {
				LOG.warning("Worksheet not found: " + worksheetId);
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_WS_ID).build();
			}
			LOG.info("Worksheet found: " + worksheetId);

			String execRef = "execution_" + worksheetId;
			Key esKey = esKeyFactory.newKey(execRef);
			Entity es = txn.get(esKey);
			if (es != null) {
				LOG.warning("Execution sheet already exists: " + execRef);
				txn.rollback();
				return Response.status(Status.CONFLICT).entity(MESSAGE_EXISTING_EXEC_SHEET).build();
			}

			Query<Entity> operationQuery = Query.newEntityQueryBuilder().setKind(WorkSheetConstants.WS_OPERATION)
					.setFilter(PropertyFilter.eq(WorkSheetConstants.WS_OP_WSID, worksheetId)).build();
			QueryResults<Entity> operationResults = txn.run(operationQuery);

			Query<Entity> propertyQuery = Query.newEntityQueryBuilder().setKind(WorkSheetConstants.WS_PROP)
					.setFilter(PropertyFilter.eq(WorkSheetConstants.WS_P_WSW, worksheetId)).build();
			QueryResults<Entity> propertyResults = txn.run(propertyQuery);

			List<Entity> properties = new ArrayList<>();
			propertyResults.forEachRemaining(properties::add);

			Entity.Builder esBuilder = Entity.newBuilder(esKey)
					.set(ExecutionSheetConstants.ES_WORKSHEET_ID, worksheetId);

			ListValue.Builder observationsBuilder = ListValue.newBuilder();
			esBuilder.set(ExecutionSheetConstants.ES_OBSERVATIONS, observationsBuilder.build());
			txn.put(esBuilder.build());

			while (operationResults.hasNext()) {
				Entity operation = operationResults.next();
				String operationCode = operation.getString(WorkSheetConstants.WS_OP_OPC);
				Double areaHa = operation.getDouble(WorkSheetConstants.WS_OP_AHA);

				String operationKey = execRef + "_" + operationCode;
				Key opKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_OPERATION)
						.newKey(operationKey);

				Entity.Builder opBuilder = Entity.newBuilder(opKey)
						.set(ExecutionSheetConstants.EO_EXECUTIONSHEET_ID, execRef)
						.set(ExecutionSheetConstants.EO_OPERATION_CODE, operationCode)
						.set(ExecutionSheetConstants.EO_TOTAL_AREA_HA, areaHa != null ? areaHa : 0.0)
						.set(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT, 0.0);

				ListValue.Builder opObservationsBuilder = ListValue.newBuilder();
				opBuilder.set(ExecutionSheetConstants.EO_OBSERVATIONS, opObservationsBuilder.build());
				txn.put(opBuilder.build());

				for (Entity property : properties) {
					long polygonId = property.getLong(WorkSheetConstants.WS_P_PID);

					Key pKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_PARCEL)
							.newKey(operationKey + "_" + polygonId);

					Entity.Builder pBuilder = Entity.newBuilder(pKey)
							.set(ExecutionSheetConstants.EP_OPERATION_ID, operationKey)
							.set(ExecutionSheetConstants.EP_POLYGON_ID, polygonId)
							.set(ExecutionSheetConstants.EP_STATUS, ExecutionSheetConstants.EP_STATUS_PA);

					ListValue.Builder prObservationsBuilder = ListValue.newBuilder();
					pBuilder.set(ExecutionSheetConstants.EP_OBSERVATIONS, prObservationsBuilder.build());

					ListValue.Builder prOperatorBuilder = ListValue.newBuilder();
					pBuilder.set(ExecutionSheetConstants.EP_OPERATORS, prOperatorBuilder.build());
					txn.put(pBuilder.build());
				}
			}

			txn.commit();
			LOG.info(LOG_MESSAGE_CREATE_EXECUTION_SHEET_SUCCESSFUL + worksheetId);
			return Response.ok(g.toJson(true)).build();
		} catch (DatastoreException e) {
			LOG.severe("DatastoreException creating execution sheet: " + e.getMessage());
			e.printStackTrace();
			return Response.status(Status.INTERNAL_SERVER_ERROR)
					.entity(MESSAGE_ERROR_CREATING_EXECUTION_SHEET + e.getMessage()).build();
		} catch (Exception e) {
			LOG.severe("Unexpected error creating execution sheet: " + e.getMessage());
			e.printStackTrace();
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Unexpected error: " + e.getMessage()).build();
		} finally {
			if (txn.isActive()) {
				LOG.warning("Rolling back active transaction");
				txn.rollback();
			}
		}
	}

	@POST
	@Path("/assign/{id}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response assignOperator(@PathParam("id") String id, @HeaderParam("Authorization") String authHeader,
			@QueryParam("username") String username) {
		Transaction txn = datastore.newTransaction();
		try {
			List<String> roles = List.of(AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			LOG.fine(LOG_MESSAGE_ASSIGN_OPERATOR_ATTEMPT);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			Query<Entity> operator = Query.newEntityQueryBuilder().setKind(AccountConstants.USER)
					.setFilter(PropertyFilter.eq(AccountConstants.DS_USERNAME, username)).build();
			QueryResults<Entity> operatorQuery = txn.run(operator);

			if (!operatorQuery.hasNext()) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_USER).build();
			}

			Entity operatorEntity = operatorQuery.next();
			if (!operatorEntity.getString(AccountConstants.DS_ROLE).equals(AccountConstants.PARTNER_OPERATOR) || !user
					.getString(AccountConstants.DS_PARTNER).equals(operatorEntity.getString(AccountConstants.DS_PARTNER))) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_PERMISSION).build();
			}

			if (id.split("_").length != 4) {
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity(MESSAGE_INVALID_PATH).build();
			}

			Key propertyOperationKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_PARCEL)
					.newKey(id);
			Entity propertyOperationEntity = txn.get(propertyOperationKey);

			if (propertyOperationEntity == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_PARCEL).build();
			}

			List<Value<?>> operators = propertyOperationEntity.getList(ExecutionSheetConstants.EP_OPERATORS);
			ListValue.Builder newOperators = ListValue.newBuilder();
			operators.forEach(newOperators::addValue);
			newOperators.addValue(StringValue.of(username));
			ListValue updatedList = newOperators.build();
			Entity.Builder updatedFeat = Entity.newBuilder(propertyOperationEntity)
					.set(ExecutionSheetConstants.EP_OPERATORS, updatedList);

			if (propertyOperationEntity.getString(ExecutionSheetConstants.EP_STATUS)
					.equals(ExecutionSheetConstants.EP_STATUS_PA)) {
				updatedFeat.set(ExecutionSheetConstants.EP_STATUS, ExecutionSheetConstants.EP_STATUS_A);
			}

			txn.update(updatedFeat.build());
			return Response.ok(g.toJson(true)).build();
		} catch (DatastoreException e) {
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity(e.toString()).build();
		} finally {
			if (txn.isActive()) {
				txn.rollback();
			}
		}
	}

	@POST
	@Path("/start/{id}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response startActivity(@PathParam("id") String parcelId, @HeaderParam("Authorization") String authHeader) {
		LOG.fine(LOG_START_ACTIVITY_ATTEMPT);
		Transaction txn = datastore.newTransaction();
		try {
			List<String> roles = List.of(AccountConstants.PARTNER_OPERATOR);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String[] splitId = parcelId.split("_");

			if (splitId.length != 4) {
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity(MESSAGE_INVALID_PATH).build();
			}

			Key propertyOperationKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_PARCEL)
					.newKey(parcelId);
			Entity propertyOperationEntity = txn.get(propertyOperationKey);

			if (propertyOperationEntity == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_PARCEL).build();
			}

			if (propertyOperationEntity.getString(ExecutionSheetConstants.EP_STATUS)
					.equals(ExecutionSheetConstants.EP_STATUS_PA)) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_STATUS).build();
			}

			List<Value<?>> operators = propertyOperationEntity.getList(ExecutionSheetConstants.EP_OPERATORS);
			Value<String> username = StringValue.of(user.getString(AccountConstants.DS_USERNAME));
			if (!operators.contains(username)) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_UNASSIGNED_PARCEL).build();
			}

			String activityId = UUID.randomUUID().toString();

			Key activityKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_ACTIVITY)
					.newKey(parcelId + "_" + activityId);

			Date startDate = new Date();

			Entity.Builder builder = Entity.newBuilder(activityKey).set(ExecutionSheetConstants.EA_PARCEL_ID, parcelId)
					.set(ExecutionSheetConstants.EA_OPERATOR_ID, username)
					.set(ExecutionSheetConstants.EA_START_DATETIME, Timestamp.of(startDate))
					.set(ExecutionSheetConstants.EA_OBSERVATIONS, StringValue.of(""))
					.set(ExecutionSheetConstants.EA_GPS_PATH, StringValue.of(""))
					.set(ExecutionSheetConstants.EA_PHOTO_URLS, ListValue.newBuilder().build());

			Entity activity = builder.build();

			builder = Entity.newBuilder(propertyOperationKey);
			if (!propertyOperationEntity.contains(ExecutionSheetConstants.EP_START_DATETIME)) {
				builder.set(ExecutionSheetConstants.EP_START_DATETIME, Timestamp.of(startDate));
			}
			if (propertyOperationEntity.getString(ExecutionSheetConstants.EP_STATUS)
					.equals(ExecutionSheetConstants.EP_STATUS_A)) {
				builder.set(ExecutionSheetConstants.EP_STATUS, ExecutionSheetConstants.EP_STATUS_EE);
			}
			builder.set(ExecutionSheetConstants.EP_LAST_ACTIVITY_DATETIME, Timestamp.of(startDate));
			txn.update(builder.build());

			String executionSheetId = new StringBuilder().append(splitId[0]).append("_").append(splitId[1]).toString();
			String operationId = new StringBuilder().append(executionSheetId).append("_").append(splitId[2]).toString();

			Key operationKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_OPERATION)
					.newKey(operationId);
			Entity operationEntity = txn.get(operationKey);

			builder = Entity.newBuilder(operationKey);
			if (!operationEntity.contains(ExecutionSheetConstants.EO_START_DATETIME)) {
				builder.set(ExecutionSheetConstants.EO_START_DATETIME, Timestamp.of(startDate));
			}
			builder.set(ExecutionSheetConstants.EO_LAST_ACTIVITY_DATETIME, Timestamp.of(startDate));
			txn.update(builder.build());

			Key executionSheetKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_SHEET)
					.newKey(executionSheetId);
			Entity executionSheetEntity = txn.get(executionSheetKey);

			builder = Entity.newBuilder(executionSheetKey);
			if (!executionSheetEntity.contains(ExecutionSheetConstants.ES_START_DATETIME)) {
				builder.set(ExecutionSheetConstants.ES_START_DATETIME, Timestamp.of(startDate));
			}
			builder.set(ExecutionSheetConstants.ES_LAST_ACTIVITY_DATETIME, Timestamp.of(startDate));
			txn.update(builder.build());

			txn.put(activity);
			txn.commit();
			return Response.ok(g.toJson(activityId)).build();
		} catch (DatastoreException e) {
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity(e.toString()).build();
		} finally {
			if (txn.isActive()) {
				txn.rollback();
			}
		}
	}

	@PUT
	@Path("/stop/{id}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response stopActivity(@PathParam("id") String activityId, @HeaderParam("Authorization") String authHeader,
			@QueryParam("finished") boolean finished) {
		LOG.fine(LOG_START_ACTIVITY_ATTEMPT);
		Transaction txn = datastore.newTransaction();
		try {
			List<String> roles = List.of(AccountConstants.PARTNER_OPERATOR);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String[] splitId = activityId.split("_");

			if (splitId.length != 5) {
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity(MESSAGE_INVALID_PATH).build();
			}

			// Extract parcel ID from activity ID (remove the last part which is the
			// activity UUID)
			String parcelId = splitId[0] + "_" + splitId[1] + "_" + splitId[2] + "_" + splitId[3];

			Key propertyOperationKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_PARCEL)
					.newKey(parcelId);
			Entity propertyOperationEntity = txn.get(propertyOperationKey);

			if (propertyOperationEntity == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_PARCEL).build();
			}

			if (!propertyOperationEntity.getString(ExecutionSheetConstants.EP_STATUS)
					.equals(ExecutionSheetConstants.EP_STATUS_EE)) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_STATUS).build();
			}

			List<Value<?>> operators = propertyOperationEntity.getList(ExecutionSheetConstants.EP_OPERATORS);
			Value<String> username = StringValue.of(user.getString(AccountConstants.DS_USERNAME));
			if (!operators.contains(username)) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_UNASSIGNED_PARCEL).build();
			}

			Key activityKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_ACTIVITY)
					.newKey(activityId);
			Entity activityEntity = txn.get(activityKey);
			if (activityEntity == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_ACTIVITY).build();
			}

			Date endDate = new Date();

			Entity.Builder builder = Entity.newBuilder(activityKey);
			builder.set(ExecutionSheetConstants.EA_END_DATETIME, Timestamp.of(endDate));
			txn.update(builder.build());
			if (finished) {
				String activityParcelId = activityEntity.getString(ExecutionSheetConstants.EA_PARCEL_ID);
				Key activityParcelKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_PARCEL)
						.newKey(activityParcelId);
				Entity activityParcelEntity = txn.get(activityParcelKey);
				Entity.Builder activityParcelBuilder = Entity.newBuilder(activityParcelKey);
				activityParcelBuilder.set(ExecutionSheetConstants.EP_END_DATETIME, Timestamp.of(endDate));
				activityParcelBuilder.set(ExecutionSheetConstants.EP_STATUS, ExecutionSheetConstants.EP_STATUS_E);
				txn.update(activityParcelBuilder.build());

				Key polygonKey = datastore.newKeyFactory().setKind(WorkSheetConstants.WS_PROP)
						.newKey(activityParcelEntity.getLong(ExecutionSheetConstants.EP_POLYGON_ID));
				Entity polygonEntity = txn.get(polygonKey);
				String geometry = polygonEntity.getString(WorkSheetConstants.WS_P_GEOMETRY);
				JsonNode node = safeParse(geometry);
				// transormar coordenaras para wsg84
				PolygonArea polygon = new PolygonArea(Geodesic.WGS84, false);
				Iterator<JsonNode> points = node.path("coordinates").get(0).iterator();
				JsonNode point;
				while (points.hasNext()) {
					point = points.next();
					ProjCoordinate src = new ProjCoordinate(point.get(0).asDouble(), point.get(1).asDouble());
					CoordinateTransform transform = new CoordinateTransformFactory().createTransform(
							new CRSFactory().createFromParameters("PT-TM06",
									"+proj=tmerc +lat_0=39.66825833333333 +lon_0=-8.13190611111111 +k=1.0 "
											+ "+x_0=200000 +y_0=300000 +ellps=GRS80 +units=m +no_defs"),
							new CRSFactory().createFromName("epsg:4326"));
					ProjCoordinate dst = new ProjCoordinate();
					transform.transform(src, dst);
					polygon.AddPoint(dst.y, dst.x);
				}

				PolygonResult result = polygon.Compute();
				double area = Math.abs(result.area) / 10000;

				Key operationKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_OPERATION)
						.newKey(polygonEntity.getString(ExecutionSheetConstants.EP_OPERATION_ID));
				Entity operationEntity = txn.get(operationKey);
				builder = Entity.newBuilder(operationKey);
				double newPercentage = operationEntity.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT)
						+ area / operationEntity.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_HA) * 100;
				boolean operationFinished = false;
				if (newPercentage >= 100.0) {
					operationFinished = true;
					newPercentage = 100.0;
				}
				builder.set(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT, newPercentage);
				if (operationFinished) {
					builder.set(ExecutionSheetConstants.EO_END_DATETIME, Timestamp.of(endDate));
				}
				txn.update(builder.build());
				if (operationFinished) {
					Query<Entity> executionSheetOperations = Query.newEntityQueryBuilder()
							.setKind(ExecutionSheetConstants.EXEC_OPERATION)
							.setFilter(PropertyFilter.eq(ExecutionSheetConstants.EO_EXECUTIONSHEET_ID,
									operationEntity.getString(ExecutionSheetConstants.EO_EXECUTIONSHEET_ID)))
							.build();
					QueryResults<Entity> operationQuery = txn.run(executionSheetOperations);
					boolean allOpsFinished = true;
					Entity operation;
					while (operationQuery.hasNext()) {
						operation = operationQuery.next();
						if (operation.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT) < 100.0) {
							allOpsFinished = false;
							break;
						}
					}
					if (allOpsFinished) {
						Key executionSheetKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_SHEET)
								.newKey(operationEntity.getString(ExecutionSheetConstants.EO_EXECUTIONSHEET_ID));
						builder = Entity.newBuilder(executionSheetKey);
						builder.set(ExecutionSheetConstants.ES_END_DATETIME, Timestamp.of(endDate));
						txn.update(builder.build());
					}
				}

			}
			txn.commit();
			return Response.ok(g.toJson(true)).build();
		} catch (DatastoreException e) {
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity(e.toString()).build();
		} finally {
			if (txn.isActive()) {
				txn.rollback();
			}
		}
	}

	@GET
	@Path("/view/{id}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response viewActivity(@PathParam("id") String parcelId, @HeaderParam("Authorization") String authHeader) {
		List<String> roles = List.of(
				AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
				AccountConstants.PARTNER_OPERATOR,
				AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE,
				AccountConstants.SHEET_GENERAL_VIEWER_BACKOFFICE,
				AccountConstants.SHEET_MANAGER_BACKOFFICE);

		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

		if (user == null) {
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
		}

		String[] splitId = parcelId.split("_");

		if (splitId.length != 4) {
			return Response.status(Status.BAD_REQUEST).entity(MESSAGE_INVALID_PATH).build();
		}

		Key parcelKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_PARCEL).newKey(parcelId);
		Entity parcelEntity = datastore.get(parcelKey);
		if (parcelEntity == null) {
			return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_PARCEL).build();
		}

		ObjectNode root = mapper.createObjectNode();
		root.put("parcel", parcelEntity.getString(ExecutionSheetConstants.EP_POLYGON_ID));
		root.put(ExecutionSheetConstants.EP_STATUS, parcelEntity.getString(ExecutionSheetConstants.EP_STATUS));
		if (parcelEntity.contains(ExecutionSheetConstants.EP_START_DATETIME)) {
			root.put(ExecutionSheetConstants.EP_START_DATETIME,
					parcelEntity.getTimestamp(ExecutionSheetConstants.EP_START_DATETIME).toString());
		}
		if (parcelEntity.contains(ExecutionSheetConstants.EP_LAST_ACTIVITY_DATETIME)) {
			root.put(ExecutionSheetConstants.EP_LAST_ACTIVITY_DATETIME,
					parcelEntity.getTimestamp(ExecutionSheetConstants.EP_LAST_ACTIVITY_DATETIME).toString());
		}
		if (parcelEntity.contains(ExecutionSheetConstants.EP_END_DATETIME)) {
			root.put(ExecutionSheetConstants.EP_END_DATETIME,
					parcelEntity.getTimestamp(ExecutionSheetConstants.EP_END_DATETIME).toString());
		}
		ArrayNode a = root.putArray(ExecutionSheetConstants.EP_OPERATORS);
		parcelEntity.getList(ExecutionSheetConstants.EP_OPERATORS).forEach(v -> a.add(((StringValue) v).get()));

		ArrayNode obser = root.putArray(ExecutionSheetConstants.EP_OBSERVATIONS);
		parcelEntity.getList(ExecutionSheetConstants.EP_OBSERVATIONS).forEach(v -> obser.add(((StringValue) v).get()));

		Query<Entity> actQuery = Query.newEntityQueryBuilder().setKind(ExecutionSheetConstants.EXEC_ACTIVITY)
				.setFilter(PropertyFilter.eq(ExecutionSheetConstants.EA_PARCEL_ID, parcelId)).build();
		QueryResults<Entity> actResults = datastore.run(actQuery);

		ArrayNode activitiesArray = root.putArray("activities");
		while (actResults.hasNext()) {
			Entity act = actResults.next();
			ObjectNode actNode = mapper.createObjectNode();
			actNode.put(ExecutionSheetConstants.EA_ACTIVITY_ID, act.getKey().getName());
			if (act.contains(ExecutionSheetConstants.EA_OPERATOR_ID)) {
				String op = act.getString(ExecutionSheetConstants.EA_OPERATOR_ID);
				if (op != null && !op.isEmpty()) {
					actNode.put(ExecutionSheetConstants.EA_OPERATOR_ID, op);
				}
			}
			if (act.contains(ExecutionSheetConstants.EA_START_DATETIME)) {
				actNode.put(ExecutionSheetConstants.EA_START_DATETIME,
						act.getTimestamp(ExecutionSheetConstants.EA_START_DATETIME).toString());
			}
			if (act.contains(ExecutionSheetConstants.EA_END_DATETIME)) {
				actNode.put(ExecutionSheetConstants.EA_END_DATETIME,
						act.getTimestamp(ExecutionSheetConstants.EA_END_DATETIME).toString());
			}

			if (act.contains(ExecutionSheetConstants.EA_OBSERVATIONS)) {
				String obs = act.getString(ExecutionSheetConstants.EA_OBSERVATIONS);
				if (obs != null && !obs.isEmpty()) {
					actNode.put(ExecutionSheetConstants.EA_OBSERVATIONS, obs);
				}
			}
			if (act.contains(ExecutionSheetConstants.EA_GPS_PATH)) {
				String gpsPath = act.getString(ExecutionSheetConstants.EA_GPS_PATH);
				if (gpsPath != null && !gpsPath.isEmpty()) {
					actNode.put(ExecutionSheetConstants.EA_GPS_PATH, gpsPath);
				}
			}
			if (act.contains(ExecutionSheetConstants.EA_PHOTO_URLS)) {
				List<Value<?>> photos = act.getList(ExecutionSheetConstants.EA_PHOTO_URLS);
				if (photos != null && !photos.isEmpty()) {
					ArrayNode photoArray = actNode.putArray(ExecutionSheetConstants.EA_PHOTO_URLS);
					for (Value<?> v : photos) {
						photoArray.add(((StringValue) v).get());
					}
				}
			}
			activitiesArray.add(actNode);
		}
		String json;
		try {
			json = mapper.writeValueAsString(root);
		} catch (JsonProcessingException e) {
			LOG.log(Level.SEVERE, "Erro a serializar JSON.", e);
			throw new WebApplicationException("Erro interno ao gerar JSON.", e, Status.INTERNAL_SERVER_ERROR);
		}
		return Response.ok(json).build();
	}

	@PUT
	@Path("/add")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response addActivityInfo(@HeaderParam("Authorization") String authHeader, AddActivityInfoData data) {
		Transaction txn = datastore.newTransaction();
		try {
			List<String> roles = List.of(AccountConstants.PARTNER_OPERATOR);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			Key activityKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_ACTIVITY)
					.newKey(data.activityId);
			Entity activityEntity = txn.get(activityKey);

			if (activityEntity == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_ACTIVITY).build();
			}

			if (!activityEntity.getString(ExecutionSheetConstants.EA_OPERATOR_ID)
					.equals(user.getString(AccountConstants.DS_USERNAME))) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_PERMISSION).build();
			}

			if (!activityEntity.contains(ExecutionSheetConstants.EA_END_DATETIME)) {
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity(MESSAGE_UNFINISHED_ACTIVITY).build();
			}
			Key parcelKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_PARCEL)
					.newKey(activityEntity.getString(ExecutionSheetConstants.EA_PARCEL_ID));
			Entity parcelEntity = datastore.get(parcelKey);

			Entity.Builder builder = Entity.newBuilder(activityEntity);
			Entity.Builder parcelBuilder = Entity.newBuilder(parcelEntity);

			if (data.observations != null && !data.observations.isBlank()) {
				String existing = "";
				if (activityEntity.contains(ExecutionSheetConstants.EA_OBSERVATIONS)) {
					existing = activityEntity.getString(ExecutionSheetConstants.EA_OBSERVATIONS);
				}
				String updated = existing.isEmpty() ? data.observations : existing + ";" + data.observations;
				builder.set(ExecutionSheetConstants.EA_OBSERVATIONS, updated);

				List<Value<String>> existingList = new ArrayList<>();
				;
				if (parcelEntity.contains(ExecutionSheetConstants.EP_OBSERVATIONS)) {
					existingList = parcelEntity.getList(ExecutionSheetConstants.EP_OBSERVATIONS);
				}
				List<Value<String>> updatedParcelList = new ArrayList<>();
				if (!existingList.isEmpty()) {
					existingList.forEach(v -> updatedParcelList.add(v));
				}
				updatedParcelList.add(StringValue.of(data.observations));
				parcelBuilder.set(ExecutionSheetConstants.EP_OBSERVATIONS, updatedParcelList);

				Key operationKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_OPERATION)
						.newKey(parcelEntity.getString(ExecutionSheetConstants.EP_OPERATION_ID));
				Entity operationEntity = datastore.get(operationKey);

				existingList = new ArrayList<>();
				if (operationEntity.contains(ExecutionSheetConstants.EO_OBSERVATIONS)) {
					existingList = operationEntity.getList(ExecutionSheetConstants.EO_OBSERVATIONS);
				}
				List<Value<String>> updatedOperationList = new ArrayList<>();
				if (!existingList.isEmpty()) {
					existingList.forEach(v -> updatedOperationList.add(v));
				}
				updatedOperationList.add(StringValue.of(data.observations));
				txn.update(Entity.newBuilder(operationEntity).set(ExecutionSheetConstants.EO_OBSERVATIONS, updatedOperationList)
						.build());

				Key workSheetKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_SHEET)
						.newKey(operationEntity.getString(ExecutionSheetConstants.EO_EXECUTIONSHEET_ID));
				Entity workSheetEntity = datastore.get(workSheetKey);

				existingList = new ArrayList<>();
				if (workSheetEntity.contains(ExecutionSheetConstants.ES_OBSERVATIONS)) {
					existingList = workSheetEntity.getList(ExecutionSheetConstants.ES_OBSERVATIONS);
				}
				List<Value<String>> updatedWorkSheetList = new ArrayList<>();
				if (!existingList.isEmpty()) {
					existingList.forEach(v -> updatedWorkSheetList.add(v));
				}
				updatedWorkSheetList.add(StringValue.of(data.observations));
				txn.update(Entity.newBuilder(workSheetEntity).set(ExecutionSheetConstants.ES_OBSERVATIONS, updatedWorkSheetList)
						.build());
			}

			if (data.gpsPath != null && !data.gpsPath.isBlank()) {
				String existing = "";
				if (activityEntity.contains(ExecutionSheetConstants.EA_GPS_PATH)) {
					existing = activityEntity.getString(ExecutionSheetConstants.EA_GPS_PATH);
				}
				String updated = existing.isEmpty() ? data.gpsPath : existing + ";" + data.gpsPath;
				builder.set(ExecutionSheetConstants.EA_GPS_PATH, updated);

				if (parcelEntity.contains(ExecutionSheetConstants.EP_GPS_PATH)) {
					existing = parcelEntity.getString(ExecutionSheetConstants.EP_GPS_PATH);
				}
				updated = existing.isEmpty() ? data.gpsPath : existing + ";" + data.gpsPath;
				parcelBuilder.set(ExecutionSheetConstants.EP_GPS_PATH, updated);
			}

			if (data.photoUrls != null && !data.photoUrls.isEmpty()) {
				List<Value<String>> merged = new ArrayList<>();
				if (activityEntity.contains(ExecutionSheetConstants.EA_PHOTO_URLS)) {
					merged.addAll(activityEntity.getList(ExecutionSheetConstants.EA_PHOTO_URLS).stream()
							.map(v -> StringValue.of(((StringValue) v).get())).toList());
				}
				for (String url : data.photoUrls) {
					merged.add(StringValue.of(url));
				}
				builder.set(ExecutionSheetConstants.EA_PHOTO_URLS, merged);
			}
			txn.update(parcelBuilder.build());
			txn.update(builder.build());
			txn.commit();
			return Response.ok(g.toJson(true)).build();
		} catch (DatastoreException e) {
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity(e.toString()).build();
		} finally {
			if (txn.isActive()) {
				txn.rollback();
			}
		}
	}

	@GET
	@Path("/status/{id}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getOperationStatus(@PathParam("id") String operationId,
			@HeaderParam("Authorization") String authHeader) {

		List<String> roles = List.of(
				AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE,
				AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
				AccountConstants.PARTNER_OPERATOR,
				AccountConstants.SYSTEM_ADMIN_ROLE,
				AccountConstants.SYSTEM_BACKOFFICE_ROLE,
				AccountConstants.SHEET_MANAGER_BACKOFFICE);
		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

		if (user == null) {
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
		}

		if (operationId == null || operationId.trim().isEmpty()) {
			LOG.warning("Invalid operationId: null or empty");
			return Response.status(Status.BAD_REQUEST).entity("Invalid operation or execution sheet ID").build();
		}

		// Check if this is an execution sheet ID (starts with "execution_")
		if (operationId.startsWith("execution_")) {
			return getExecutionSheetStatus(operationId, user);
		}

		// Original operation status logic
		Key opKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_OPERATION).newKey(operationId);
		Entity op = datastore.get(opKey);
		if (op == null) {
			return Response.status(Status.NOT_FOUND).entity("Operation not found").build();
		}

		ObjectNode root = mapper.createObjectNode();
		root.put(ExecutionSheetConstants.EO_OPERATION_CODE, op.getString(ExecutionSheetConstants.EO_OPERATION_CODE));
		if (op.contains(ExecutionSheetConstants.EO_START_DATETIME))
			root.put(ExecutionSheetConstants.EO_START_DATETIME,
					op.getTimestamp(ExecutionSheetConstants.EO_START_DATETIME).toString());
		if (op.contains(ExecutionSheetConstants.EO_LAST_ACTIVITY_DATETIME))
			root.put(ExecutionSheetConstants.EO_LAST_ACTIVITY_DATETIME,
					op.getTimestamp(ExecutionSheetConstants.EO_LAST_ACTIVITY_DATETIME).toString());

		root.put(ExecutionSheetConstants.EO_TOTAL_AREA_HA, op.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_HA));
		root.put(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT,
				op.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT));
		if (op.contains(ExecutionSheetConstants.EO_END_DATETIME)) {
			root.put(ExecutionSheetConstants.EO_END_DATETIME,
					op.getTimestamp(ExecutionSheetConstants.EO_END_DATETIME).toString());
		}
		if (op.contains(ExecutionSheetConstants.EO_OBSERVATIONS)) {
			root.put(ExecutionSheetConstants.EO_OBSERVATIONS, op.getString(ExecutionSheetConstants.EO_OBSERVATIONS));
		}

		Query<Entity> parcelQuery = Query.newEntityQueryBuilder().setKind(ExecutionSheetConstants.EXEC_PARCEL)
				.setFilter(PropertyFilter.eq(ExecutionSheetConstants.EP_OPERATION_ID, operationId)).build();
		QueryResults<Entity> parcels = datastore.run(parcelQuery);

		ArrayNode parcelsArray = root.putArray("parcels");
		while (parcels.hasNext()) {
			Entity parcel = parcels.next();

			ObjectNode pnode = mapper.createObjectNode();
			pnode.put(ExecutionSheetConstants.EP_POLYGON_ID, parcel.getLong(ExecutionSheetConstants.EP_POLYGON_ID));
			pnode.put(ExecutionSheetConstants.EP_STATUS, parcel.getString(ExecutionSheetConstants.EP_STATUS));

			ArrayNode a = pnode.putArray(ExecutionSheetConstants.EP_OPERATORS);
			parcel.getList(ExecutionSheetConstants.EP_OPERATORS).forEach(v -> a.add(((StringValue) v).get()));

			ArrayNode obser = pnode.putArray(ExecutionSheetConstants.EP_OBSERVATIONS);
			parcel.getList(ExecutionSheetConstants.EP_OBSERVATIONS).forEach(v -> obser.add(((StringValue) v).get()));

			Query<Entity> actQuery = Query.newEntityQueryBuilder().setKind(ExecutionSheetConstants.EXEC_ACTIVITY)
					.setFilter(PropertyFilter.eq(ExecutionSheetConstants.EA_PARCEL_ID, parcel.getKey().getName()))
					.build();
			QueryResults<Entity> acts = datastore.run(actQuery);

			ArrayNode actsArray = pnode.putArray("activities");
			while (acts.hasNext()) {
				Entity act = acts.next();
				ObjectNode anode = mapper.createObjectNode();

				if (act.contains(ExecutionSheetConstants.EA_OPERATOR_ID)) {
					anode.put(ExecutionSheetConstants.EA_OPERATOR_ID,
							act.getString(ExecutionSheetConstants.EA_OPERATOR_ID));
				}
				if (act.contains(ExecutionSheetConstants.EA_START_DATETIME)) {
					anode.put(ExecutionSheetConstants.EA_START_DATETIME,
							act.getTimestamp(ExecutionSheetConstants.EA_START_DATETIME).toString());
				}
				if (act.contains(ExecutionSheetConstants.EA_END_DATETIME)) {
					anode.put(ExecutionSheetConstants.EA_END_DATETIME,
							act.getTimestamp(ExecutionSheetConstants.EA_END_DATETIME).toString());
				}
				if (act.contains(ExecutionSheetConstants.EA_OBSERVATIONS)) {
					anode.put(ExecutionSheetConstants.EA_OBSERVATIONS,
							act.getString(ExecutionSheetConstants.EA_OBSERVATIONS));
				}
				if (act.contains(ExecutionSheetConstants.EA_GPS_PATH)) {
					anode.put(ExecutionSheetConstants.EA_GPS_PATH, act.getString(ExecutionSheetConstants.EA_GPS_PATH));
				}
				if (act.contains(ExecutionSheetConstants.EA_PHOTO_URLS)) {
					List<Value<?>> photos = act.getList(ExecutionSheetConstants.EA_PHOTO_URLS);
					if (!photos.isEmpty()) {
						ArrayNode pa = anode.putArray(ExecutionSheetConstants.EA_PHOTO_URLS);
						for (Value<?> v : photos) {
							pa.add(((StringValue) v).get());
						}
					}
				}
				actsArray.add(anode);
			}

			parcelsArray.add(pnode);
		}

		try {
			String json = mapper.writeValueAsString(root);
			return Response.ok(json).build();
		} catch (JsonProcessingException e) {
			LOG.log(Level.SEVERE, "Erro ao serializar JSON", e);
			throw new WebApplicationException("Erro interno ao gerar JSON", e, Status.INTERNAL_SERVER_ERROR);
		}
	}

	// New method to handle execution sheet status
	private Response getExecutionSheetStatus(String executionSheetId, Entity user) {
		try {
			// Extract worksheet ID from execution sheet ID
			String worksheetIdStr = executionSheetId.replace("execution_", "");
			if (worksheetIdStr.isEmpty()) {
				LOG.warning("Invalid executionSheetId: " + executionSheetId + " - empty worksheet ID");
				return Response.status(Status.BAD_REQUEST).entity("Invalid execution sheet ID format").build();
			}

			Long worksheetId;
			try {
				worksheetId = Long.parseLong(worksheetIdStr);
			} catch (NumberFormatException e) {
				LOG.warning("Invalid worksheet ID format: " + worksheetIdStr);
				return Response.status(Status.BAD_REQUEST).entity("Invalid worksheet ID").build();
			}

			// Get the execution sheet
			Key esKey = esKeyFactory.newKey(executionSheetId);
			Entity es = datastore.get(esKey);
			if (es == null) {
				return Response.status(Status.NOT_FOUND).entity("Execution sheet not found").build();
			}

			// Get all operations for this execution sheet
			Query<Entity> operationsQuery = Query.newEntityQueryBuilder()
					.setKind(ExecutionSheetConstants.EXEC_OPERATION)
					.setFilter(PropertyFilter.eq(ExecutionSheetConstants.EO_EXECUTIONSHEET_ID, executionSheetId))
					.build();
			QueryResults<Entity> operations = datastore.run(operationsQuery);

			ObjectNode result = mapper.createObjectNode();
			result.put("executionSheetId", executionSheetId);
			result.put("worksheetId", worksheetId);
			result.put("operationCode", "MULTIPLE"); // Multiple operations
			result.put("totalAreaHa", 0.0);
			result.put("totalAreaPercent", 0.0);

			// Calculate totals from all operations
			double totalAreaHa = 0.0;
			double totalAreaPercent = 0.0;
			int operationCount = 0;

			while (operations.hasNext()) {
				Entity op = operations.next();
				totalAreaHa += op.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_HA);
				totalAreaPercent += op.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT);
				operationCount++;
			}

			if (operationCount > 0) {
				result.put("totalAreaHa", totalAreaHa);
				result.put("totalAreaPercent", totalAreaPercent / operationCount); // Average percentage
			}

			// Add execution sheet timestamps
			if (es.contains(ExecutionSheetConstants.ES_START_DATETIME)) {
				result.put("startDateTime", es.getTimestamp(ExecutionSheetConstants.ES_START_DATETIME).toString());
			}
			if (es.contains(ExecutionSheetConstants.ES_LAST_ACTIVITY_DATETIME)) {
				result.put("lastActivityDateTime",
						es.getTimestamp(ExecutionSheetConstants.ES_LAST_ACTIVITY_DATETIME).toString());
			}
			if (es.contains(ExecutionSheetConstants.ES_END_DATETIME)) {
				result.put("endDateTime", es.getTimestamp(ExecutionSheetConstants.ES_END_DATETIME).toString());
			}

			String json = mapper.writeValueAsString(result);
			return Response.ok(json).build();

		} catch (Exception e) {
			LOG.log(Level.SEVERE, "Error getting execution sheet status for ID " + executionSheetId, e);
			return Response.status(Status.INTERNAL_SERVER_ERROR)
					.entity("Error getting execution sheet status: " + e.getMessage()).build();
		}
	}

	@PUT
	@Path("/edit")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response editOperation(@HeaderParam("Authorization") String authHeader,
			EditOperationData editOperationData) {
		Transaction txn = datastore.newTransaction();
		try {
			List<String> roles = List.of(AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			Key operationKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_OPERATION)
					.newKey(editOperationData.operationId);
			Entity operationEntity = txn.get(operationKey);
			if (operationEntity == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_OPERATION).build();
			}

			List<Value<?>> observations = operationEntity.getList(ExecutionSheetConstants.EO_OBSERVATIONS);
			ListValue.Builder newObservations = ListValue.newBuilder();
			observations.forEach(newObservations::addValue);
			newObservations.addValue(StringValue.of(editOperationData.observations));
			ListValue updatedList = newObservations.build();
			Entity.Builder updatedFeat = Entity.newBuilder(operationEntity).set(ExecutionSheetConstants.EO_OBSERVATIONS,
					updatedList);

			txn.update(updatedFeat.build());
			txn.commit();

		} catch (DatastoreException e) {
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity(e.toString()).build();
		} finally {
			if (txn.isActive()) {
				txn.rollback();
			}
		}

		return Response.ok().entity(g.toJson(true)).build();
	}

	@GET
	@Path("/export")
	@Produces(MediaType.APPLICATION_JSON)
	public Response exportSheet(@HeaderParam("Authorization") String authHeader,
			@QueryParam("workSheetId") long worksheetId) {
		Transaction txn = datastore.newTransaction();
		try {
			// 1) AuthN/Z
			List<String> roles = List.of(AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE);
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);
			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			// 2) Load the sheet
			Key sheetKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_SHEET)
					.newKey("execution_" + worksheetId);
			Entity sheet = txn.get(sheetKey);
			if (sheet == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity("Worksheet not found").build();
			}

			ObjectNode result = mapper.createObjectNode();
			// Prep the JSON container
			result.put("id", worksheetId);
			result.put("starting_date", sheet.getTimestamp(ExecutionSheetConstants.ES_START_DATETIME).toString());
			result.put("finishing_date", sheet.getTimestamp(ExecutionSheetConstants.ES_END_DATETIME).toString());
			result.put("last_activity_date",
					sheet.getTimestamp(ExecutionSheetConstants.ES_LAST_ACTIVITY_DATETIME).toString());
			result.put("observations",
					sheet.contains(ExecutionSheetConstants.ES_OBSERVATIONS)
							? sheet.getList(ExecutionSheetConstants.ES_OBSERVATIONS).toString()
							: "");

			String prefix = "execution_" + worksheetId;

			// 3) Load and filter all ExecutionOperation
			ArrayNode opsList = result.putArray("operations");
			Map<String, Integer> opCodeToIndex = new HashMap<>();
			QueryResults<Entity> opResults = txn
					.run(Query.newEntityQueryBuilder().setKind(ExecutionSheetConstants.EXEC_OPERATION).build());
			int opIdx = 1;
			while (opResults.hasNext()) {
				Entity op = opResults.next();
				String keyName = op.getKey().getName();
				if (!keyName.startsWith(prefix))
					continue;

				String opCode = op.getString(ExecutionSheetConstants.EO_OPERATION_CODE);
				ObjectNode mop = mapper.createObjectNode();
				mop.put("operation_code", opCode);
				mop.put("area_ha_executed", op.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_HA)
						* op.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT));
				mop.put("area_perc", op.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT));
				mop.put("starting_date", op.getTimestamp(ExecutionSheetConstants.EO_START_DATETIME).toString());
				mop.put("finishing_date", op.getTimestamp(ExecutionSheetConstants.EO_END_DATETIME).toString());
				mop.put("observations",
						op.contains(ExecutionSheetConstants.EO_OBSERVATIONS)
								? op.getList(ExecutionSheetConstants.EO_OBSERVATIONS).toString()
								: "");
				opsList.add(mop);
				opCodeToIndex.put(opCode, opIdx++);
			}

			// polygons_operations as ArrayNode
			ArrayNode polyOps = result.putArray("polygons_operations");

			QueryResults<Entity> parcResults = txn
					.run(Query.newEntityQueryBuilder().setKind(ExecutionSheetConstants.EXEC_PARCEL).build());
			Map<Long, ArrayNode> polyMap = new LinkedHashMap<>();
			while (parcResults.hasNext()) {
				Entity p = parcResults.next();
				String name = p.getKey().getName();
				if (!name.startsWith(prefix))
					continue;

				String[] parts = name.split("_");
				long polygonId = Long.parseLong(parts[3]);
				String opCode = parts[2];
				int opId = opCodeToIndex.getOrDefault(opCode, 0);

				// se for a primeira vez, cria o container
				ArrayNode opsForPoly = polyMap.computeIfAbsent(polygonId, k -> mapper.createArrayNode());

				ObjectNode entry = mapper.createObjectNode();
				entry.put("operation_id", opId);
				entry.put("status", convertStatus(p.getString(ExecutionSheetConstants.EP_STATUS)));
				entry.put("starting_date", p.getTimestamp(ExecutionSheetConstants.EP_START_DATETIME).toString());
				entry.put("finishing_date", p.getTimestamp(ExecutionSheetConstants.EP_END_DATETIME).toString());
				entry.put("last_activity_date",
						p.getTimestamp(ExecutionSheetConstants.EP_LAST_ACTIVITY_DATETIME).toString());
				entry.put("observations",
						p.contains(ExecutionSheetConstants.EP_OBSERVATIONS)
								? p.getList(ExecutionSheetConstants.EP_OBSERVATIONS).toString()
								: "");
				ArrayNode tracks = mapper.createArrayNode();
				// 1) Montar um prefixo para encontrar as atividades desta parcela:
				String actPrefix = prefix // "execution_<wsId>"
						+ "_" + opCode + "_" + polygonId + "_"; // deixa o "_" final para casar com activityId

				// 2) Query só das activities deste parcel:
				Query<Entity> actQuery = Query.newEntityQueryBuilder().setKind(ExecutionSheetConstants.EXEC_ACTIVITY)
						.build();
				txn.run(actQuery).forEachRemaining(a -> {
					String aName = a.getKey().getName();
					if (!aName.startsWith(actPrefix))
						return; // ignora outras

					ObjectNode track = mapper.createObjectNode();
					// geometry / percurso
					try {
						JsonNode path = mapper.readTree(a.getString(ExecutionSheetConstants.EA_GPS_PATH));
						track.set("coordinates", path);
					} catch (IOException e) {
						// em caso de JSON mal formado, puxa um array vazio ou loga
						track.set("coordinates", mapper.createObjectNode());
					}
					tracks.add(track);
				});

				// 3) associa ao bloco da parcela
				entry.set("tracks", tracks);

				opsForPoly.add(entry);
			}

			// converte o map para o array final
			for (Map.Entry<Long, ArrayNode> e : polyMap.entrySet()) {
				ObjectNode block = mapper.createObjectNode();
				block.put("polygon_id", e.getKey());
				block.set("operations", e.getValue());
				polyOps.add(block);
			}

			txn.commit();
			return Response.ok(result).build();

		} catch (DatastoreException | NumberFormatException ex) {
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity(ex.toString()).build();
		} finally {
			if (txn.isActive())
				txn.rollback();
		}
	}

	@GET
	@Path("/list")
	@Produces(MediaType.APPLICATION_JSON)
	public Response listExecutionSheets(@HeaderParam("Authorization") String authHeader) {
		try {
			List<String> roles = List.of(AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE,
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE, AccountConstants.PARTNER_OPERATOR,
					AccountConstants.SHEET_MANAGER_BACKOFFICE, AccountConstants.SHEET_GENERAL_VIEWER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			Query<Entity> query = Query.newEntityQueryBuilder()
					.setKind(ExecutionSheetConstants.EXEC_SHEET)
					.build();

			QueryResults<Entity> results = datastore.run(query);
			ArrayNode executionSheets = mapper.createArrayNode();

			while (results.hasNext()) {
				Entity es = results.next();
				String executionSheetId = es.getKey().getName();
				ObjectNode esNode = mapper.createObjectNode();
				esNode.put("id", executionSheetId);
				esNode.put("worksheetId", es.getLong(ExecutionSheetConstants.ES_WORKSHEET_ID));

				// Find the first activity (earliest start date) for this execution sheet
				// Get all parcels for this execution sheet
				Query<Entity> parcelsQuery = Query.newEntityQueryBuilder()
						.setKind(ExecutionSheetConstants.EXEC_PARCEL)
						.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
						.build();
				QueryResults<Entity> parcels = datastore.run(parcelsQuery);

				Timestamp earliestStartDate = null;
				while (parcels.hasNext()) {
					Entity parcel = parcels.next();
					String parcelId = parcel.getKey().getName();
					
					// Get all activities for this parcel
					Query<Entity> activitiesQuery = Query.newEntityQueryBuilder()
							.setKind(ExecutionSheetConstants.EXEC_ACTIVITY)
							.setFilter(PropertyFilter.eq(ExecutionSheetConstants.EA_PARCEL_ID, parcelId))
							.build();
					QueryResults<Entity> activities = datastore.run(activitiesQuery);
					
					while (activities.hasNext()) {
						Entity activity = activities.next();
						if (activity.contains(ExecutionSheetConstants.EA_START_DATETIME)) {
							Timestamp activityStartDate = activity.getTimestamp(ExecutionSheetConstants.EA_START_DATETIME);
							if (earliestStartDate == null || activityStartDate.toSqlTimestamp().before(earliestStartDate.toSqlTimestamp())) {
								earliestStartDate = activityStartDate;
							}
						}
					}
				}

				// Use the earliest activity start date as the execution sheet start date
				if (earliestStartDate != null) {
					esNode.put("startDateTime", earliestStartDate.toString());
				} else if (es.contains(ExecutionSheetConstants.ES_START_DATETIME)
						&& es.getTimestamp(ExecutionSheetConstants.ES_START_DATETIME) != null) {
					// Fallback to execution sheet start date if no activities found
					esNode.put("startDateTime", es.getTimestamp(ExecutionSheetConstants.ES_START_DATETIME).toString());
				}

				if (es.contains(ExecutionSheetConstants.ES_LAST_ACTIVITY_DATETIME)
						&& es.getTimestamp(ExecutionSheetConstants.ES_LAST_ACTIVITY_DATETIME) != null) {
					esNode.put("lastActivityDateTime",
							es.getTimestamp(ExecutionSheetConstants.ES_LAST_ACTIVITY_DATETIME).toString());
				}
				if (es.contains(ExecutionSheetConstants.ES_END_DATETIME)
						&& es.getTimestamp(ExecutionSheetConstants.ES_END_DATETIME) != null) {
					esNode.put("endDateTime", es.getTimestamp(ExecutionSheetConstants.ES_END_DATETIME).toString());
				}

				// Calculate progress
				Query<Entity> operationsQuery = Query.newEntityQueryBuilder()
						.setKind(ExecutionSheetConstants.EXEC_OPERATION)
						.setFilter(PropertyFilter.eq(ExecutionSheetConstants.EO_EXECUTIONSHEET_ID, executionSheetId))
						.build();
				QueryResults<Entity> operations = datastore.run(operationsQuery);

				double totalProgress = 0.0;
				int operationCount = 0;
				while (operations.hasNext()) {
					Entity operation = operations.next();
					totalProgress += operation.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT);
					operationCount++;
				}

				double avgProgress = operationCount > 0 ? totalProgress / operationCount : 0.0;
				esNode.put("progress", Math.round(avgProgress * 100.0) / 100.0);
				esNode.put("status", avgProgress >= 100.0 ? "COMPLETO" : (avgProgress > 0 ? "EM PROGRESSO" : "NÃO INICIADO"));

				// Load social data for this execution sheet using unified system
				// Get likes (from unified system)
				Query<Entity> likesQuery = Query.newEntityQueryBuilder()
						.setKind("ExecutionSheetLike")
						.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
						.build();
				QueryResults<Entity> likes = datastore.run(likesQuery);

				int likeCount = 0;
				boolean userLiked = false;
				while (likes.hasNext()) {
					Entity like = likes.next();
					likeCount++;
					if (like.getString("username").equals(username)) {
						userLiked = true;
					}
				}
				esNode.put("likes", likeCount);
				esNode.put("userLiked", userLiked);

				// Get photos count (from unified system - excluding activity media)
				Query<Entity> photosQuery = Query.newEntityQueryBuilder()
						.setKind("ExecutionSheetPhoto")
						.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
						.build();
				QueryResults<Entity> photos = datastore.run(photosQuery);

				int photoCount = 0;
				while (photos.hasNext()) {
					Entity photo = photos.next();
					// Skip photos that are associated with activity posts to avoid duplication
					if (photo.contains("activityPostId") && photo.getString("activityPostId") != null) {
						continue;
					}
					// Skip photos that are flagged as activity media
					if (photo.contains("isActivityMedia") && photo.getBoolean("isActivityMedia")) {
						continue;
					}
					photoCount++;
				}
				esNode.put("photos", photoCount);

				// Get text posts count (from unified system)
				Query<Entity> textPostsQuery = Query.newEntityQueryBuilder()
						.setKind("SocialPost")
						.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
						.build();
				QueryResults<Entity> textPosts = datastore.run(textPostsQuery);

				int textPostCount = 0;
				while (textPosts.hasNext()) {
					textPosts.next();
					textPostCount++;
				}
				esNode.put("textPosts", textPostCount);

				// Get activity posts count (from unified system)
				Query<Entity> activityPostsQuery = Query.newEntityQueryBuilder()
						.setKind("SocialActivityPost")
						.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
						.build();
				QueryResults<Entity> activityPosts = datastore.run(activityPostsQuery);

				int activityPostCount = 0;
				while (activityPosts.hasNext()) {
					activityPosts.next();
					activityPostCount++;
				}
				esNode.put("activities", activityPostCount);

				executionSheets.add(esNode);
			}

			return Response.ok(mapper.writeValueAsString(executionSheets)).build();

		} catch (Exception e) {
			LOG.severe("Error listing execution sheets: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error listing execution sheets").build();
		}
	}

	@POST
	@Path("/{id}/like")
	@Produces(MediaType.APPLICATION_JSON)
	public Response toggleLike(@PathParam("id") String executionSheetId,
			@HeaderParam("Authorization") String authHeader) {
		Transaction txn = datastore.newTransaction();
		try {
			List<String> roles = List.of(
					AccountConstants.REGISTERED_USER,
					AccountConstants.PARTNER_OPERATOR,
					AccountConstants.ADHERENT_LANDOWNER_USER,
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			Key esKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_SHEET).newKey(executionSheetId);
			Entity es = txn.get(esKey);

			if (es == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity("Execution sheet not found").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			LOG.info("User " + username + " attempting to toggle like for execution sheet: " + executionSheetId);

			// Check if like already exists
			Key likeKey = datastore.newKeyFactory().setKind("ExecutionSheetLike")
					.newKey(executionSheetId + "_" + username);
			Entity existingLike = txn.get(likeKey);

			ObjectNode result = mapper.createObjectNode();
			List<String> operatorsToNotify = new ArrayList<>();
			Long worksheetId = null;

			if (existingLike != null) {
				// Unlike
				txn.delete(likeKey);
				result.put("liked", false);
				result.put("message", "Like removed");
				LOG.info("User " + username + " unliked execution sheet: " + executionSheetId);
			} else {
				// Like
				Entity like = Entity.newBuilder(likeKey)
						.set("executionSheetId", executionSheetId)
						.set("username", username)
						.set("timestamp", Timestamp.now())
						.build();
				txn.put(like);
				result.put("liked", true);
				result.put("message", "Like added");
				LOG.info("User " + username + " liked execution sheet: " + executionSheetId);

				// Get execution sheet data for notifications
				worksheetId = es.getLong(ExecutionSheetConstants.ES_WORKSHEET_ID);

				// Find users involved in this execution sheet (operators, etc.)
				Query<Entity> operatorsQuery = Query.newEntityQueryBuilder()
						.setKind(ExecutionSheetConstants.EXEC_PARCEL)
						.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
						.build();
				QueryResults<Entity> operators = txn.run(operatorsQuery);

				// Collect all operators involved (but not the user who liked)
				while (operators.hasNext()) {
					Entity parcel = operators.next();
					if (parcel.contains(ExecutionSheetConstants.EP_OPERATORS)) {
						List<Value<?>> operatorsList = parcel.getList(ExecutionSheetConstants.EP_OPERATORS);
						for (Value<?> op : operatorsList) {
							String operatorUsername = ((StringValue) op).get();
							if (!operatorUsername.equals(username)) {
								operatorsToNotify.add(operatorUsername);
							}
						}
					}
				}
			}

			// Count total likes
			Query<Entity> likesQuery = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetLike")
					.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
					.build();
			QueryResults<Entity> likes = txn.run(likesQuery);

			int likeCount = 0;
			while (likes.hasNext()) {
				likes.next();
				likeCount++;
			}

			result.put("totalLikes", likeCount);
			LOG.info("Total likes for execution sheet " + executionSheetId + ": " + likeCount);

			// Commit transaction
			txn.commit();

			// Create notifications after successful commit (only for new likes)
			if (result.get("liked").asBoolean()) {
				final Long finalWorksheetId = worksheetId;
				for (String operatorUsername : operatorsToNotify) {
					NotificationResource.createNotification(
							operatorUsername,
							username,
							"like",
							"Nova curtida",
							username + " curtiu a folha de execução WS #" + finalWorksheetId,
							executionSheetId);
				}
			}

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive()) {
				txn.rollback();
			}
			LOG.severe("Error toggling like: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error processing like").build();
		}
	}

	@POST
	@Path("/{id}/comment")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response addComment(@PathParam("id") String executionSheetId, @HeaderParam("Authorization") String authHeader,
			String commentJson) {
		Transaction txn = datastore.newTransaction();
		try {
			List<String> roles = List.of(
					AccountConstants.REGISTERED_USER,
					AccountConstants.PARTNER_OPERATOR,
					AccountConstants.ADHERENT_LANDOWNER_USER,
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			JsonNode commentData = mapper.readTree(commentJson);
			String comment = commentData.get("comment").asText();

			if (comment == null || comment.trim().isEmpty()) {
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity("Comment cannot be empty").build();
			}

			Key esKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_SHEET).newKey(executionSheetId);
			Entity es = txn.get(esKey);

			if (es == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity("Execution sheet not found").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);
			String commentId = executionSheetId + "_" + System.currentTimeMillis();

			LOG.info("User " + username + " adding comment to execution sheet: " + executionSheetId);
			LOG.info("Comment: " + comment);

			Key commentKey = datastore.newKeyFactory().setKind("ExecutionSheetComment").newKey(commentId);
			Entity commentEntity = Entity.newBuilder(commentKey)
					.set("executionSheetId", executionSheetId)
					.set("username", username)
					.set("comment", comment)
					.set("timestamp", Timestamp.now())
					.build();

			txn.put(commentEntity);

			// Get execution sheet data for notifications
			Long worksheetId = es.getLong(ExecutionSheetConstants.ES_WORKSHEET_ID);
			List<String> operatorsToNotify = new ArrayList<>();

			// Find users involved in this execution sheet
			Query<Entity> operatorsQuery = Query.newEntityQueryBuilder()
					.setKind(ExecutionSheetConstants.EXEC_PARCEL)
					.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
					.build();
			QueryResults<Entity> operators = txn.run(operatorsQuery);

			while (operators.hasNext()) {
				Entity parcel = operators.next();
				if (parcel.contains(ExecutionSheetConstants.EP_OPERATORS)) {
					List<Value<?>> operatorsList = parcel.getList(ExecutionSheetConstants.EP_OPERATORS);
					for (Value<?> op : operatorsList) {
						String operatorUsername = ((StringValue) op).get();
						if (!operatorUsername.equals(username)) {
							operatorsToNotify.add(operatorUsername);
						}
					}
				}
			}

			// Also notify previous commenters
			Query<Entity> commentsQuery = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetComment")
					.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
					.build();
			QueryResults<Entity> previousComments = txn.run(commentsQuery);

			while (previousComments.hasNext()) {
				Entity prevComment = previousComments.next();
				String prevCommenter = prevComment.getString("username");
				if (!prevCommenter.equals(username) && !operatorsToNotify.contains(prevCommenter)) {
					operatorsToNotify.add(prevCommenter);
				}
			}

			txn.commit();
			LOG.info("Comment added successfully. Comment ID: " + commentId);

			// Create notifications after successful commit
			final Long finalWorksheetId = worksheetId;
			for (String operatorUsername : operatorsToNotify) {
				NotificationResource.createNotification(
						operatorUsername,
						username,
						"comment",
						"Novo comentário",
						username + " comentou na folha de execução WS #" + finalWorksheetId,
						executionSheetId);
			}

			ObjectNode result = mapper.createObjectNode();
			result.put("id", commentId);
			result.put("username", username);
			result.put("comment", comment);
			result.put("timestamp", commentEntity.getTimestamp("timestamp").toString());

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive()) {
				txn.rollback();
			}
			LOG.severe("Error adding comment: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error adding comment").build();
		}
	}

	@GET
	@Path("/{id}/social")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getSocialData(@PathParam("id") String executionSheetId,
			@HeaderParam("Authorization") String authHeader) {
		try {
			List<String> roles = List.of(
					AccountConstants.REGISTERED_USER,
					AccountConstants.PARTNER_OPERATOR,
					AccountConstants.ADHERENT_LANDOWNER_USER,
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE,
					AccountConstants.SHEET_GENERAL_VIEWER_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			ObjectNode result = mapper.createObjectNode();
			String username = user.getString(AccountConstants.DS_USERNAME);

			LOG.info("Getting social data for execution sheet: " + executionSheetId + " for user: " + username);

			// Get likes
			Query<Entity> likesQuery = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetLike")
					.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
					.build();
			QueryResults<Entity> likes = datastore.run(likesQuery);

			int likeCount = 0;
			boolean userLiked = false;
			while (likes.hasNext()) {
				Entity like = likes.next();
				likeCount++;
				if (like.getString("username").equals(username)) {
					userLiked = true;
				}
			}

			LOG.info("Found " + likeCount + " likes for execution sheet: " + executionSheetId);

			// Get comments
			Query<Entity> commentsQuery = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetComment")
					.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
					.build();
			QueryResults<Entity> comments = datastore.run(commentsQuery);

			ArrayNode commentsArray = result.putArray("comments");
			int commentCount = 0;
			while (comments.hasNext()) {
				Entity comment = comments.next();
				ObjectNode commentNode = mapper.createObjectNode();
				commentNode.put("id", comment.getKey().getName());
				commentNode.put("username", comment.getString("username"));
				commentNode.put("comment", comment.getString("comment"));
				commentNode.put("timestamp", comment.getTimestamp("timestamp").toString());
				commentsArray.add(commentNode);
				commentCount++;
			}

			LOG.info("Found " + commentCount + " comments for execution sheet: " + executionSheetId);

			result.put("totalLikes", likeCount);
			result.put("userLiked", userLiked);

			LOG.info("Returning social data: " + mapper.writeValueAsString(result));

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Error getting social data: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting social data").build();
		}
	}

	@GET
	@Path("/available-worksheets")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getAvailableWorksheets(@HeaderParam("Authorization") String authHeader) {
		try {
			// Allow more roles to access available worksheets
			List<String> roles = List.of(
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE,
					AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE,
					AccountConstants.SHEET_GENERAL_VIEWER_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			// Get all worksheets
			Query<Entity> worksheetsQuery = Query.newEntityQueryBuilder()
					.setKind(WorkSheetConstants.WORKSHEET)
					.build();
			QueryResults<Entity> worksheets = datastore.run(worksheetsQuery);

			// Get existing execution sheets
			Query<Entity> executionSheetsQuery = Query.newEntityQueryBuilder()
					.setKind(ExecutionSheetConstants.EXEC_SHEET)
					.build();
			QueryResults<Entity> executionSheets = datastore.run(executionSheetsQuery);

			// Collect existing worksheet IDs
			List<Long> existingWorksheetIds = new ArrayList<>();
			while (executionSheets.hasNext()) {
				Entity es = executionSheets.next();
				existingWorksheetIds.add(es.getLong(ExecutionSheetConstants.ES_WORKSHEET_ID));
			}

			// Filter available worksheets
			ArrayNode availableWorksheets = mapper.createArrayNode();
			while (worksheets.hasNext()) {
				Entity ws = worksheets.next();
				Long worksheetId = ws.getKey().getId();

				if (!existingWorksheetIds.contains(worksheetId)) {
					ObjectNode wsNode = mapper.createObjectNode();
					wsNode.put("id", worksheetId);
					wsNode.put("startingDate", ws.getString(WorkSheetConstants.WS_STARTING_DATE));
					wsNode.put("finishingDate", ws.getString(WorkSheetConstants.WS_FINISHING_DATE));
					wsNode.put("issueDate", ws.getString(WorkSheetConstants.WS_ISSUE_DATE));
					wsNode.put("serviceProviderId", ws.getLong(WorkSheetConstants.WS_SERVICE_PROVIDER_ID));
					availableWorksheets.add(wsNode);
				}
			}

			return Response.ok(mapper.writeValueAsString(availableWorksheets)).build();

		} catch (Exception e) {
			LOG.severe("Error getting available worksheets: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting available worksheets").build();
		}
	}

	@POST
	@Path("/photo/upload/{activityId}")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response uploadActivityPhoto(@PathParam("activityId") String activityId,
			@HeaderParam("Authorization") String authHeader, String photoDataJson) {
		Transaction txn = datastore.newTransaction();
		try {
			List<String> roles = List.of(
					AccountConstants.PARTNER_OPERATOR,
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			JsonNode photoData;
			try {
				photoData = mapper.readTree(photoDataJson);
			} catch (JsonProcessingException e) {
				LOG.severe("Invalid photo data JSON: " + e.getMessage());
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity("Invalid photo data format").build();
			}

			String base64Image = photoData.get("image").asText();
			String description = photoData.has("description") ? photoData.get("description").asText() : "";
			String gpsLocation = photoData.has("location") ? photoData.get("location").asText() : "";

			// Check if this is an execution sheet ID or activity ID
			boolean isExecutionSheet = activityId.startsWith("execution_");

			if (isExecutionSheet) {
				// Handle execution sheet photo upload
				return uploadExecutionSheetPhoto(activityId, user, base64Image, description, gpsLocation, txn);
			} else {
				// Handle activity photo upload (existing logic)
				return uploadActivityPhotoInternal(activityId, user, base64Image, description, gpsLocation, txn);
			}

		} catch (Exception e) {
			if (txn.isActive()) {
				txn.rollback();
			}
			LOG.severe("Error uploading photo: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error uploading photo").build();
		}
	}

	private Response uploadActivityPhotoInternal(String activityId, Entity user, String base64Image,
			String description, String gpsLocation, Transaction txn) {
		try {
			// Verify activity exists and user has permission
			Key activityKey = datastore.newKeyFactory()
					.setKind(ExecutionSheetConstants.EXEC_ACTIVITY)
					.newKey(activityId);
			Entity activity = txn.get(activityKey);

			if (activity == null) {
				return Response.status(Status.NOT_FOUND).entity(MESSAGE_INVALID_ACTIVITY).build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// Check if user is assigned to this activity
			if (!activity.getString(ExecutionSheetConstants.EA_OPERATOR_ID).equals(username)) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_UNASSIGNED_PARCEL).build();
			}

			// Create photo entity
			String photoId = "photo_" + activityId + "_" + System.currentTimeMillis();
			Key photoKey = datastore.newKeyFactory().setKind("ActivityPhoto").newKey(photoId);

			// Upload to GCS
			Storage storage = StorageOptions.getDefaultInstance().getService();
			String bucketName = "terra-watch-photos";
			String blobName = photoId + ".jpg";
			BlobId blobId = BlobId.of(bucketName, blobName);
			BlobInfo blobInfo = BlobInfo.newBuilder(blobId).setContentType("image/jpeg").build();

			LOG.info("Attempting to upload activity photo to GCS " + blobName);

			byte[] imageBytes = Base64.getDecoder().decode(base64Image);
			LOG.info("Decoded activity image size: " + imageBytes.length + " bytes");

			try {
				storage.create(blobInfo, imageBytes);
				LOG.info("Successfully uploaded activity photo to GCS: " + blobName);

				// Make public
				storage.createAcl(blobId, Acl.of(Acl.User.ofAllUsers(), Acl.Role.READER));
				LOG.info("Successfully made activity photo public in GCS: " + blobName);
			} catch (Exception gcsError) {
				LOG.severe("Failed to upload activity photo to GCS: " + gcsError.getMessage());
				throw new RuntimeException("GCS upload failed: " + gcsError.getMessage(), gcsError);
			}

			String photoUrl = "https://storage.googleapis.com/" + bucketName + "/" + blobName;
			String thumbnailUrl = photoUrl; // Use same for now

			Entity photo = Entity.newBuilder(photoKey)
					.set("activityId", activityId)
					.set("url", photoUrl)
					.set("thumbnailUrl", thumbnailUrl)
					.set("description", description)
					.set("uploadedBy", username)
					.set("uploadTimestamp", Timestamp.now())
					.set("location", gpsLocation)
					.build();

			txn.put(photo);

			// Update activity with photo reference
			List<Value<?>> currentPhotos = activity.contains(ExecutionSheetConstants.EA_PHOTO_URLS)
					? activity.getList(ExecutionSheetConstants.EA_PHOTO_URLS)
					: new ArrayList<>();

			List<Value<?>> updatedPhotos = new ArrayList<>(currentPhotos);
			updatedPhotos.add(StringValue.of(photoUrl));

			Entity updatedActivity = Entity.newBuilder(activity)
					.set(ExecutionSheetConstants.EA_PHOTO_URLS, updatedPhotos)
					.build();

			txn.update(updatedActivity);
			txn.commit();

			// Create notification for activity photo
			String parcelId = activity.getString(ExecutionSheetConstants.EA_PARCEL_ID);
			NotificationResource.createNotification(
					null, // broadcast to all involved
					username,
					"photo",
					"Nova foto adicionada",
					username + " adicionou uma foto à atividade",
					activityId);

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("photoId", photoId);
			result.put("url", photoUrl);
			result.put("thumbnailUrl", thumbnailUrl);
			result.put("message", "Foto enviada com sucesso");

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Error uploading activity photo: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error uploading photo").build();
		}
	}

	private Response uploadExecutionSheetPhoto(String executionSheetId, Entity user, String base64Image,
			String description, String gpsLocation, Transaction txn) {
		try {
			String username = user.getString(AccountConstants.DS_USERNAME);

			// Create photo entity for execution sheet
			String photoId = "photo_" + executionSheetId + "_" + System.currentTimeMillis();
			Key photoKey = datastore.newKeyFactory().setKind("ExecutionSheetPhoto").newKey(photoId);

			// Upload to GCS
			Storage storage = StorageOptions.getDefaultInstance().getService();
			String bucketName = "terra-watch-photos";
			String blobName = photoId + ".jpg";
			BlobId blobId = BlobId.of(bucketName, blobName);
			BlobInfo blobInfo = BlobInfo.newBuilder(blobId).setContentType("image/jpeg").build();

			LOG.info("Attempting to upload execution sheet photo to GCS " + blobName);

			byte[] imageBytes = Base64.getDecoder().decode(base64Image);
			LOG.info("Decoded execution sheet image size: " + imageBytes.length + " bytes");

			try {
				storage.create(blobInfo, imageBytes);
				LOG.info("Successfully uploaded execution sheet photo to GCS: " + blobName);

				// Make public
				storage.createAcl(blobId, Acl.of(Acl.User.ofAllUsers(), Acl.Role.READER));
				LOG.info("Successfully made execution sheet photo public in GCS: " + blobName);
			} catch (Exception gcsError) {
				LOG.severe("Failed to upload execution sheet photo to GCS: " + gcsError.getMessage());
				throw new RuntimeException("GCS upload failed: " + gcsError.getMessage(), gcsError);
			}

			String photoUrl = "https://storage.googleapis.com/" + bucketName + "/" + blobName;
			String thumbnailUrl = photoUrl; // Use same for now

			Entity photo = Entity.newBuilder(photoKey)
					.set("executionSheetId", executionSheetId)
					.set("url", photoUrl)
					.set("thumbnailUrl", thumbnailUrl)
					.set("description", description)
					.set("uploadedBy", username)
					.set("uploadTimestamp", Timestamp.now())
					.set("location", gpsLocation)
					.build();

			txn.put(photo);
			txn.commit();

			// Create notification for execution sheet photo
			NotificationResource.createNotification(
					null, // broadcast to all involved
					username,
					"photo",
					"Nova foto adicionada",
					username + " adicionou uma foto: " + description,
					executionSheetId);

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("photoId", photoId);
			result.put("url", photoUrl);
			result.put("thumbnailUrl", thumbnailUrl);
			result.put("message", "Foto enviada com sucesso");

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Error uploading execution sheet photo: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error uploading photo: " + e.getMessage()).build();
		}
	}

	@GET
	@Path("/photo/activity/{activityId}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getActivityPhotos(@PathParam("activityId") String activityId,
			@HeaderParam("Authorization") String authHeader) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			// Check if this is an execution sheet ID or activity ID
			boolean isExecutionSheet = activityId.startsWith("execution_");

			if (isExecutionSheet) {
				return getExecutionSheetPhotos(activityId, user);
			} else {
				return getActivityPhotosInternal(activityId, user);
			}

		} catch (Exception e) {
			LOG.severe("Error getting photos: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting photos").build();
		}
	}

	private Response getActivityPhotosInternal(String activityId, Entity user) {
		try {
			// Get all photos for the activity
			Query<Entity> photosQuery = Query.newEntityQueryBuilder()
					.setKind("ActivityPhoto")
					.setFilter(PropertyFilter.eq("activityId", activityId))
					.setOrderBy(OrderBy.desc("uploadTimestamp"))
					.build();

			QueryResults<Entity> photos = datastore.run(photosQuery);
			ArrayNode photosArray = mapper.createArrayNode();

			String currentUsername = user.getString(AccountConstants.DS_USERNAME);

			while (photos.hasNext()) {
				Entity photo = photos.next();
				ObjectNode photoNode = mapper.createObjectNode();

				photoNode.put("id", photo.getKey().getName());
				// Use direct GCS URLs since photos are made public
				String bucketName = "terra-watch-photos";
				String blobName = photo.getKey().getName() + ".jpg";
				String gcsUrl = "https://storage.googleapis.com/" + bucketName + "/" + blobName;
				photoNode.put("url", gcsUrl);
				photoNode.put("thumbnailUrl", gcsUrl);
				photoNode.put("description", photo.getString("description"));
				photoNode.put("uploadedBy", photo.getString("uploadedBy"));
				photoNode.put("uploadTimestamp", photo.getTimestamp("uploadTimestamp").toString());
				photoNode.put("location", photo.getString("location"));

				// Get likes for this photo
				Query<Entity> likesQuery = Query.newEntityQueryBuilder()
						.setKind("PhotoLike")
						.setFilter(PropertyFilter.eq("photoId", photo.getKey().getName()))
						.build();
				QueryResults<Entity> likes = datastore.run(likesQuery);

				int likeCount = 0;
				boolean userLiked = false;
				while (likes.hasNext()) {
					Entity like = likes.next();
					likeCount++;
					if (like.getString("username").equals(currentUsername)) {
						userLiked = true;
					}
				}

				photoNode.put("likes", likeCount);
				photoNode.put("userLiked", userLiked);

				photosArray.add(photoNode);
			}

			ObjectNode result = mapper.createObjectNode();
			result.put("activityId", activityId);
			result.set("photos", photosArray);
			result.put("totalPhotos", photosArray.size());

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Error getting activity photos: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting photos").build();
		}
	}

	private Response getExecutionSheetPhotos(String executionSheetId, Entity user) {
		try {
			LOG.info("Starting getExecutionSheetPhotos for execution sheet: " + executionSheetId);
			
			// Get all photos for the execution sheet
			Query<Entity> photosQuery = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetPhoto")
					.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
					.build();

			LOG.info("Running photos query...");
			QueryResults<Entity> photos = datastore.run(photosQuery);
			ArrayNode photosArray = mapper.createArrayNode();

			String currentUsername = user.getString(AccountConstants.DS_USERNAME);
			LOG.info("Processing photos for user: " + currentUsername);

			int photoCount = 0;
			while (photos.hasNext()) {
				Entity photo = photos.next();
				photoCount++;
				LOG.info("Processing photo " + photoCount + ": " + photo.getKey().getName());
				
				ObjectNode photoNode = mapper.createObjectNode();

				photoNode.put("id", photo.getKey().getName());
				// Use direct GCS URLs since photos are made public
				String bucketName = "terra-watch-photos";
				String blobName = photo.getKey().getName() + ".jpg";
				String gcsUrl = "https://storage.googleapis.com/" + bucketName + "/" + blobName;
				photoNode.put("url", gcsUrl);
				photoNode.put("thumbnailUrl", gcsUrl);
				photoNode.put("description", photo.getString("description"));
				photoNode.put("uploadedBy", photo.getString("uploadedBy"));
				photoNode.put("uploadTimestamp", photo.getTimestamp("uploadTimestamp").toString());
				photoNode.put("location", photo.getString("location"));

				// Get likes for this photo
				Query<Entity> likesQuery = Query.newEntityQueryBuilder()
						.setKind("PhotoLike")
						.setFilter(PropertyFilter.eq("photoId", photo.getKey().getName()))
						.build();
				QueryResults<Entity> likes = datastore.run(likesQuery);

				int likeCount = 0;
				boolean userLiked = false;
				while (likes.hasNext()) {
					Entity like = likes.next();
					likeCount++;
					if (like.getString("username").equals(currentUsername)) {
						userLiked = true;
					}
				}

				photoNode.put("likes", likeCount);
				photoNode.put("userLiked", userLiked);

				photosArray.add(photoNode);
			}

			LOG.info("Found " + photoCount + " photos for execution sheet: " + executionSheetId);

			ObjectNode result = mapper.createObjectNode();
			result.put("executionSheetId", executionSheetId);
			result.set("photos", photosArray);
			result.put("totalPhotos", photosArray.size());

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Error getting execution sheet photos: " + e.getMessage());
			e.printStackTrace(); // Add stack trace for debugging
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting photos: " + e.getMessage()).build();
		}
	}

	@POST
	@Path("/photo/{photoId}/like")
	@Produces(MediaType.APPLICATION_JSON)
	public Response togglePhotoLike(@PathParam("photoId") String photoId,
			@HeaderParam("Authorization") String authHeader) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			// Try to find photo in ActivityPhoto first
			Key photoKey = datastore.newKeyFactory().setKind("ActivityPhoto").newKey(photoId);
			Entity photo = txn.get(photoKey);
			String photoKind = "ActivityPhoto";

			// If not found, try ExecutionSheetPhoto
			if (photo == null) {
				photoKey = datastore.newKeyFactory().setKind("ExecutionSheetPhoto").newKey(photoId);
				photo = txn.get(photoKey);
				photoKind = "ExecutionSheetPhoto";
			}

			if (photo == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity("Photo not found").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// Check if like already exists
			Key likeKey = datastore.newKeyFactory().setKind("PhotoLike")
					.newKey(photoId + "_" + username);
			Entity existingLike = txn.get(likeKey);

			ObjectNode result = mapper.createObjectNode();

			if (existingLike != null) {
				// Unlike
				txn.delete(likeKey);
				result.put("liked", false);
				result.put("message", "Like removido");
			} else {
				// Like
				Entity like = Entity.newBuilder(likeKey)
						.set("photoId", photoId)
						.set("username", username)
						.set("timestamp", Timestamp.now())
						.build();
				txn.put(like);
				result.put("liked", true);
				result.put("message", "Like adicionado");

				// Notify photo uploader
				String uploader = photo.getString("uploadedBy");
				if (!uploader.equals(username)) {
					txn.commit();

					NotificationResource.createNotification(
							uploader,
							username,
							"photo_like",
							"Nova curtida em foto",
							username + " curtiu sua foto",
							photoId);

					return Response.ok(mapper.writeValueAsString(result)).build();
				}
			}

			// Count total likes for this photo
			Query<Entity> likesQuery = Query.newEntityQueryBuilder()
					.setKind("PhotoLike")
					.setFilter(PropertyFilter.eq("photoId", photoId))
					.build();
			QueryResults<Entity> likes = datastore.run(likesQuery);

			int likeCount = 0;
			while (likes.hasNext()) {
				likes.next();
				likeCount++;
			}

			result.put("totalLikes", likeCount);

			txn.commit();
			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive()) {
				txn.rollback();
			}
			LOG.severe("Error toggling photo like: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error processing like").build();
		}
	}

	@DELETE
	@Path("/photo/{photoId}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response deletePhoto(@PathParam("photoId") String photoId,
			@HeaderParam("Authorization") String authHeader) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			// Get photo
			Key photoKey = datastore.newKeyFactory().setKind("ActivityPhoto").newKey(photoId);
			Entity photo = txn.get(photoKey);

			// If not found in ActivityPhoto, try ExecutionSheetPhoto
			if (photo == null) {
				photoKey = datastore.newKeyFactory().setKind("ExecutionSheetPhoto").newKey(photoId);
				photo = txn.get(photoKey);
			}

			if (photo == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity("Photo not found").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);
			String uploader = photo.getString("uploadedBy");

			// Only uploader or admin can delete
			if (!username.equals(uploader) &&
					!user.getString(AccountConstants.DS_ROLE).equals(AccountConstants.SYSTEM_ADMIN_ROLE)) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity("Permission denied").build();
			}

			// Check if this is an activity photo or execution sheet photo
			boolean isActivityPhoto = photo.contains("activityId");

			if (isActivityPhoto) {
				// Remove photo reference from activity
				String activityId = photo.getString("activityId");
				Key activityKey = datastore.newKeyFactory()
						.setKind(ExecutionSheetConstants.EXEC_ACTIVITY)
						.newKey(activityId);
				Entity activity = txn.get(activityKey);

				if (activity != null && activity.contains(ExecutionSheetConstants.EA_PHOTO_URLS)) {
					List<Value<?>> photos = activity.getList(ExecutionSheetConstants.EA_PHOTO_URLS);
					List<Value<?>> updatedPhotos = new ArrayList<>();

					String photoUrl = photo.getString("url");
					for (Value<?> p : photos) {
						if (!((StringValue) p).get().equals(photoUrl)) {
							updatedPhotos.add(p);
						}
					}

					Entity updatedActivity = Entity.newBuilder(activity)
							.set(ExecutionSheetConstants.EA_PHOTO_URLS, updatedPhotos)
							.build();
					txn.update(updatedActivity);
				}
			}

			// Delete photo and associated likes
			txn.delete(photoKey);

			// Delete all likes for this photo
			Query<Entity> likesQuery = Query.newEntityQueryBuilder()
					.setKind("PhotoLike")
					.setFilter(PropertyFilter.eq("photoId", photoId))
					.build();
			QueryResults<Entity> likes = datastore.run(likesQuery);

			while (likes.hasNext()) {
				Entity like = likes.next();
				txn.delete(like.getKey());
			}

			txn.commit();

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("message", "Foto removida com sucesso");

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive()) {
				txn.rollback();
			}
			LOG.severe("Error deleting photo: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error deleting photo").build();
		}
	}

	private JsonNode safeParse(String json) {
		try {
			return mapper.readTree(json);
		} catch (IOException e) {
			throw new WebApplicationException("Invalid JSON", e, Status.INTERNAL_SERVER_ERROR);
		}
	}

	private byte[] createTestImageBytes() {
		// Create a simple test image (1x1 pixel JPEG)
		// This is just for testing - in production you would process the actual
		// multipart file
		String testImageBase64 = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";
		return Base64.getDecoder().decode(testImageBase64);
	}

	private String convertStatus(String ds) {
		switch (ds) {
			case "POR_ATRIBUIR":
				return "To Assign";
			case "ATRIBUIDO":
				return "Assigned";
			case "EM_EXECUCAO":
				return "In Execution";
			case "EXECUTADO":
				return "Executed";
			default:
				return ds;
		}
	}

	@GET
	@Path("/recent-activities")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getRecentActivities(@HeaderParam("Authorization") String authHeader) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			ArrayNode activities = mapper.createArrayNode();

			// Get recent execution sheet activities
			Query<Entity> executionQuery = Query.newEntityQueryBuilder()
					.setKind(ExecutionSheetConstants.EXEC_SHEET)
					.setOrderBy(OrderBy.desc(ExecutionSheetConstants.ES_LAST_ACTIVITY_DATETIME))
					.setLimit(10)
					.build();

			QueryResults<Entity> executions = datastore.run(executionQuery);

			while (executions.hasNext()) {
				Entity es = executions.next();
				if (es.contains(ExecutionSheetConstants.ES_LAST_ACTIVITY_DATETIME)) {
					ObjectNode activity = mapper.createObjectNode();
					activity.put("id", es.getKey().getName());
					activity.put("type", "execution");
					activity.put("worksheetId", es.getLong(ExecutionSheetConstants.ES_WORKSHEET_ID));
					activity.put("description", "atualizou a folha de execução");
					activity.put("timestamp",
							es.getTimestamp(ExecutionSheetConstants.ES_LAST_ACTIVITY_DATETIME).toSqlTimestamp().getTime());

					// Get social data for this execution sheet
					Query<Entity> likesQuery = Query.newEntityQueryBuilder()
							.setKind("ExecutionSheetLike")
							.setFilter(PropertyFilter.eq("executionSheetId", es.getKey().getName()))
							.build();
					QueryResults<Entity> likes = datastore.run(likesQuery);
					int likeCount = 0;
					while (likes.hasNext()) {
						likes.next();
						likeCount++;
					}
					activity.put("likes", likeCount);

					Query<Entity> commentsQuery = Query.newEntityQueryBuilder()
							.setKind("ExecutionSheetComment")
							.setFilter(PropertyFilter.eq("executionSheetId", es.getKey().getName()))
							.build();
					QueryResults<Entity> comments = datastore.run(commentsQuery);
					int commentCount = 0;
					while (comments.hasNext()) {
						comments.next();
						commentCount++;
					}
					activity.put("comments", commentCount);

					// Get username from last activity
					Query<Entity> activityQuery = Query.newEntityQueryBuilder()
							.setKind(ExecutionSheetConstants.EXEC_ACTIVITY)
							.setFilter(PropertyFilter.hasAncestor(es.getKey()))
							.setOrderBy(OrderBy.desc(ExecutionSheetConstants.EA_START_DATETIME))
							.setLimit(1)
							.build();
					QueryResults<Entity> lastActivity = datastore.run(activityQuery);
					if (lastActivity.hasNext()) {
						Entity act = lastActivity.next();
						activity.put("fromUser", act.getString(ExecutionSheetConstants.EA_OPERATOR_ID));
					} else {
						activity.put("fromUser", "Sistema");
					}

					activities.add(activity);
				}
			}

			return Response.ok(mapper.writeValueAsString(activities)).build();

		} catch (Exception e) {
			LOG.severe("Error getting recent activities: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting recent activities").build();
		}
	}

	@GET
	@Path("/recent-photos")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getRecentPhotos(@HeaderParam("Authorization") String authHeader) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String currentUsername = user.getString(AccountConstants.DS_USERNAME);
			ArrayNode photos = mapper.createArrayNode();

			// Get recent activity photos
			Query<Entity> activityPhotosQuery = Query.newEntityQueryBuilder()
					.setKind("ActivityPhoto")
					.setOrderBy(OrderBy.desc("uploadTimestamp"))
					.setLimit(10)
					.build();

			QueryResults<Entity> recentActivityPhotos = datastore.run(activityPhotosQuery);

			while (recentActivityPhotos.hasNext()) {
				Entity photo = recentActivityPhotos.next();
				ObjectNode photoNode = mapper.createObjectNode();

				photoNode.put("id", photo.getKey().getName());
				// Use direct GCS URLs since photos are made public
				String bucketName = "terra-watch-photos";
				String blobName = photo.getKey().getName() + ".jpg";
				String gcsUrl = "https://storage.googleapis.com/" + bucketName + "/" + blobName;
				photoNode.put("url", gcsUrl);
				photoNode.put("thumbnailUrl", gcsUrl);
				photoNode.put("description", photo.getString("description"));
				photoNode.put("uploadedBy", photo.getString("uploadedBy"));
				photoNode.put("uploadTimestamp", photo.getTimestamp("uploadTimestamp").toSqlTimestamp().getTime());
				photoNode.put("activityId", photo.getString("activityId"));
				photoNode.put("type", "activity");

				// Get likes for this photo
				Query<Entity> likesQuery = Query.newEntityQueryBuilder()
						.setKind("PhotoLike")
						.setFilter(PropertyFilter.eq("photoId", photo.getKey().getName()))
						.build();
				QueryResults<Entity> likes = datastore.run(likesQuery);

				int likeCount = 0;
				boolean userLiked = false;
				while (likes.hasNext()) {
					Entity like = likes.next();
					likeCount++;
					if (like.getString("username").equals(currentUsername)) {
						userLiked = true;
					}
				}

				photoNode.put("likes", likeCount);
				photoNode.put("userLiked", userLiked);

				// Get worksheet ID from activity
				String activityId = photo.getString("activityId");
				Key activityKey = datastore.newKeyFactory()
						.setKind(ExecutionSheetConstants.EXEC_ACTIVITY)
						.newKey(activityId);
				Entity activity = datastore.get(activityKey);

				if (activity != null) {
					String parcelId = activity.getString(ExecutionSheetConstants.EA_PARCEL_ID);
					// Extract worksheet ID from parcel ID (format: execution_worksheetId_parcelId)
					String[] parts = parcelId.split("_");
					if (parts.length >= 2) {
						try {
							Long worksheetId = Long.parseLong(parts[1]);
							photoNode.put("worksheetId", worksheetId);
						} catch (NumberFormatException e) {
							// Ignore if cannot parse
						}
					}
				}

				photos.add(photoNode);
			}

			// Get recent execution sheet photos
			Query<Entity> executionSheetPhotosQuery = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetPhoto")
					.setOrderBy(OrderBy.desc("uploadTimestamp"))
					.setLimit(10)
					.build();

			QueryResults<Entity> recentExecutionSheetPhotos = datastore.run(executionSheetPhotosQuery);

			while (recentExecutionSheetPhotos.hasNext()) {
				Entity photo = recentExecutionSheetPhotos.next();
				ObjectNode photoNode = mapper.createObjectNode();

				photoNode.put("id", photo.getKey().getName());
				// Use direct GCS URLs since photos are made public
				String bucketName = "terra-watch-photos";
				String blobName = photo.getKey().getName() + ".jpg";
				String gcsUrl = "https://storage.googleapis.com/" + bucketName + "/" + blobName;
				photoNode.put("url", gcsUrl);
				photoNode.put("thumbnailUrl", gcsUrl);
				photoNode.put("description", photo.getString("description"));
				photoNode.put("uploadedBy", photo.getString("uploadedBy"));
				photoNode.put("uploadTimestamp", photo.getTimestamp("uploadTimestamp").toSqlTimestamp().getTime());
				photoNode.put("executionSheetId", photo.getString("executionSheetId"));
				photoNode.put("type", "execution_sheet");

				// Get likes for this photo
				Query<Entity> likesQuery = Query.newEntityQueryBuilder()
						.setKind("PhotoLike")
						.setFilter(PropertyFilter.eq("photoId", photo.getKey().getName()))
						.build();
				QueryResults<Entity> likes = datastore.run(likesQuery);

				int likeCount = 0;
				boolean userLiked = false;
				while (likes.hasNext()) {
					Entity like = likes.next();
					likeCount++;
					if (like.getString("username").equals(currentUsername)) {
						userLiked = true;
					}
				}

				photoNode.put("likes", likeCount);
				photoNode.put("userLiked", userLiked);

				// Get worksheet ID from execution sheet ID
				String executionSheetId = photo.getString("executionSheetId");
				String worksheetIdStr = executionSheetId.replace("execution_", "");
				try {
					Long worksheetId = Long.parseLong(worksheetIdStr);
					photoNode.put("worksheetId", worksheetId);
				} catch (NumberFormatException e) {
					// Ignore if cannot parse
				}

				photos.add(photoNode);
			}

			return Response.ok(mapper.writeValueAsString(photos)).build();

		} catch (Exception e) {
			LOG.severe("Error getting recent photos: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting recent photos").build();
		}
	}

	@GET
	@Path("/test/{worksheetId}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response testExecutionSheetData(@HeaderParam("Authorization") String authHeader,
			@PathParam("worksheetId") Long worksheetId) {
		try {
			List<String> roles = List.of(
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity("User validation failed").build();
			}

			ObjectNode result = mapper.createObjectNode();
			result.put("worksheetId", worksheetId);
			result.put("user", user.getString(AccountConstants.DS_USERNAME));
			result.put("role", user.getString(AccountConstants.DS_ROLE));

			// Check worksheet exists
			Key wsKey = wsKeyFactory.newKey(worksheetId);
			Entity ws = datastore.get(wsKey);
			result.put("worksheetExists", ws != null);

			// Check if execution sheet already exists
			String execRef = "execution_" + worksheetId;
			Key esKey = esKeyFactory.newKey(execRef);
			Entity es = datastore.get(esKey);
			result.put("executionSheetExists", es != null);

			// Count operations
			Query<Entity> operationQuery = Query.newEntityQueryBuilder()
					.setKind(WorkSheetConstants.WS_OPERATION)
					.setFilter(PropertyFilter.eq(WorkSheetConstants.WS_OP_WSID, worksheetId))
					.build();
			QueryResults<Entity> operationResults = datastore.run(operationQuery);
			int opCount = 0;
			ArrayNode operations = result.putArray("operations");
			while (operationResults.hasNext()) {
				Entity op = operationResults.next();
				ObjectNode opNode = mapper.createObjectNode();
				opNode.put("code", op.getString(WorkSheetConstants.WS_OP_OPC));
				opNode.put("areaHa",
						op.contains(WorkSheetConstants.WS_OP_AHA) ? op.getDouble(WorkSheetConstants.WS_OP_AHA) : null);
				operations.add(opNode);
				opCount++;
			}
			result.put("operationCount", opCount);

			// Count properties
			Query<Entity> propertyQuery = Query.newEntityQueryBuilder()
					.setKind(WorkSheetConstants.WS_PROP)
					.setFilter(PropertyFilter.eq(WorkSheetConstants.WS_P_WSW, worksheetId))
					.build();
			QueryResults<Entity> propertyResults = datastore.run(propertyQuery);
			int propCount = 0;
			while (propertyResults.hasNext()) {
				propertyResults.next();
				propCount++;
			}
			result.put("propertyCount", propCount);

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Test endpoint error: " + e.getMessage());
			e.printStackTrace();
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error: " + e.getMessage()).build();
		}
	}

	@GET
	@Path("/test-social/{executionSheetId}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response testSocialFeatures(@PathParam("executionSheetId") String executionSheetId,
			@HeaderParam("Authorization") String authHeader) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			ObjectNode result = mapper.createObjectNode();

			// Test execution sheet exists
			Key esKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_SHEET).newKey(executionSheetId);
			Entity es = datastore.get(esKey);

			if (es == null) {
				result.put("error", "Execution sheet not found");
				return Response.ok(mapper.writeValueAsString(result)).build();
			}

			result.put("executionSheetExists", true);
			result.put("executionSheetId", executionSheetId);

			// Count likes
			Query<Entity> likesQuery = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetLike")
					.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
					.build();
			QueryResults<Entity> likes = datastore.run(likesQuery);

			int likeCount = 0;
			while (likes.hasNext()) {
				likes.next();
				likeCount++;
			}
			result.put("totalLikes", likeCount);

			// Count comments
			Query<Entity> commentsQuery = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetComment")
					.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
					.build();
			QueryResults<Entity> comments = datastore.run(commentsQuery);

			int commentCount = 0;
			while (comments.hasNext()) {
				comments.next();
				commentCount++;
			}
			result.put("totalComments", commentCount);

			// Count photos
			Query<Entity> photosQuery = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetPhoto")
					.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
					.build();
			QueryResults<Entity> photos = datastore.run(photosQuery);

			int photoCount = 0;
			while (photos.hasNext()) {
				photos.next();
				photoCount++;
			}
			result.put("totalPhotos", photoCount);

			result.put("status", "Social features test completed successfully");

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Error testing social features: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error testing social features").build();
		}
	}

	@GET
	@Path("/debug-social/{executionSheetId}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response debugSocialEndpoint(@PathParam("executionSheetId") String executionSheetId,
			@HeaderParam("Authorization") String authHeader) {
		try {
			ObjectNode result = mapper.createObjectNode();
			result.put("executionSheetId", executionSheetId);
			result.put("timestamp", System.currentTimeMillis());

			// Test authentication
			try {
				String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
				Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);
				if (user == null) {
					result.put("authError", "User validation failed");
					return Response.ok(mapper.writeValueAsString(result)).build();
				}
				result.put("user", user.getString(AccountConstants.DS_USERNAME));
				result.put("role", user.getString(AccountConstants.DS_ROLE));
			} catch (Exception e) {
				result.put("authError", "Authentication error: " + e.getMessage());
				return Response.ok(mapper.writeValueAsString(result)).build();
			}

			// Test execution sheet exists
			try {
				Key esKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_SHEET).newKey(executionSheetId);
				Entity es = datastore.get(esKey);
				result.put("executionSheetExists", es != null);
			} catch (Exception e) {
				result.put("executionSheetError", "Error checking execution sheet: " + e.getMessage());
			}

			// Test likes query
			try {
				Query<Entity> likesQuery = Query.newEntityQueryBuilder()
						.setKind("ExecutionSheetLike")
						.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
						.build();
				QueryResults<Entity> likes = datastore.run(likesQuery);
				int likeCount = 0;
				while (likes.hasNext()) {
					likes.next();
					likeCount++;
				}
				result.put("likesCount", likeCount);
			} catch (Exception e) {
				result.put("likesError", "Error querying likes: " + e.getMessage());
			}

			// Test comments query
			try {
				Query<Entity> commentsQuery = Query.newEntityQueryBuilder()
						.setKind("ExecutionSheetComment")
						.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
						.build();
				QueryResults<Entity> comments = datastore.run(commentsQuery);
				int commentCount = 0;
				while (comments.hasNext()) {
					comments.next();
					commentCount++;
				}
				result.put("commentsCount", commentCount);
			} catch (Exception e) {
				result.put("commentsError", "Error querying comments: " + e.getMessage());
			}

			// Test photos query
			try {
				Query<Entity> photosQuery = Query.newEntityQueryBuilder()
						.setKind("ExecutionSheetPhoto")
						.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
						.build();
				QueryResults<Entity> photos = datastore.run(photosQuery);
				int photoCount = 0;
				ArrayNode photosArray = mapper.createArrayNode();
				while (photos.hasNext()) {
					Entity photo = photos.next();
					photoCount++;
					
					// Log photo details for debugging
					String photoId = photo.getKey().getName();
					String photoUrl = photo.getString("url");
					String thumbnailUrl = photo.getString("thumbnailUrl");
					
					LOG.info("Photo found: " + photoId + ", URL: " + photoUrl + ", Thumbnail: " + thumbnailUrl);
					
					// Add photo details to result
					ObjectNode photoNode = mapper.createObjectNode();
					photoNode.put("id", photoId);
					photoNode.put("url", photoUrl);
					photoNode.put("thumbnailUrl", thumbnailUrl);
					photoNode.put("description", photo.getString("description"));
					photoNode.put("uploadedBy", photo.getString("uploadedBy"));
					photosArray.add(photoNode);
				}
				result.put("photosCount", photoCount);
				result.set("photos", photosArray);
			} catch (Exception e) {
				result.put("photosError", "Error querying photos: " + e.getMessage());
			}

			result.put("status", "Debug completed");

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Error in debug endpoint: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error in debug endpoint: " + e.getMessage()).build();
		}
	}

	@POST
	@Path("/{executionSheetId}/photo")
	@Consumes(MediaType.MULTIPART_FORM_DATA)
	@Produces(MediaType.APPLICATION_JSON)
	public Response uploadExecutionSheetPhotoDirect(@PathParam("executionSheetId") String executionSheetId,
			@HeaderParam("Authorization") String authHeader,
			@jakarta.ws.rs.core.Context jakarta.servlet.http.HttpServletRequest request) {
		Transaction txn = datastore.newTransaction();
		try {
			List<String> roles = List.of(
					AccountConstants.PARTNER_OPERATOR,
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			// Verify execution sheet exists
			Key esKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_SHEET).newKey(executionSheetId);
			Entity es = txn.get(esKey);

			if (es == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity("Execution sheet not found").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// --- Parse the uploaded file ---
			jakarta.servlet.http.Part filePart = null;
			jakarta.servlet.http.Part descriptionPart = null;
			try {
				filePart = request.getPart("photo");
				descriptionPart = request.getPart("description");
			} catch (Exception e) {
				LOG.severe("Error getting multipart file: " + e.getMessage());
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity("Error parsing multipart data: " + e.getMessage()).build();
			}

			if (filePart == null || filePart.getSize() == 0) {
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity("No file uploaded").build();
			}

			// Extract description from form data
			String description = "Foto da folha de execução"; // default
			if (descriptionPart != null) {
				try {
					byte[] descBytes = descriptionPart.getInputStream().readAllBytes();
					String userDescription = new String(descBytes, "UTF-8").trim();
					if (!userDescription.isEmpty()) {
						description = userDescription;
					}
				} catch (Exception e) {
					LOG.warning("Error reading description: " + e.getMessage());
				}
			}

			byte[] imageBytes = filePart.getInputStream().readAllBytes();

			// --- Upload to GCS as before ---
			Storage storage = StorageOptions.getDefaultInstance().getService();
			String bucketName = "terra-watch-photos";
			String photoId = "photo_" + executionSheetId + "_" + System.currentTimeMillis();
			String blobName = photoId + ".jpg";
			BlobId blobId = BlobId.of(bucketName, blobName);
			BlobInfo blobInfo = BlobInfo.newBuilder(blobId).setContentType(filePart.getContentType()).build();

			storage.create(blobInfo, imageBytes);
			storage.createAcl(blobId, Acl.of(Acl.User.ofAllUsers(), Acl.Role.READER));

			String photoUrl = "https://storage.googleapis.com/" + bucketName + "/" + blobName;
			String thumbnailUrl = photoUrl; // Use same for now

			Key photoKey = datastore.newKeyFactory().setKind("ExecutionSheetPhoto").newKey(photoId);
			Entity photo = Entity.newBuilder(photoKey)
					.set("executionSheetId", executionSheetId)
					.set("url", photoUrl)
					.set("thumbnailUrl", thumbnailUrl)
					.set("description", description)
					.set("uploadedBy", username)
					.set("uploadTimestamp", Timestamp.now())
					.set("location", "")
					.build();

			txn.put(photo);
			txn.commit();

			// Create notification for execution sheet photo
			NotificationResource.createNotification(
					null, // broadcast to all involved
					username,
					"photo",
					"Nova foto adicionada",
					username + " adicionou uma foto: " + description,
					executionSheetId);

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("photoId", photoId);
			result.put("url", photoUrl);
			result.put("thumbnailUrl", thumbnailUrl);
			result.put("message", "Foto enviada com sucesso");

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive())
				txn.rollback();
			LOG.severe("Error uploading execution sheet photo: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error uploading photo: " + e.getMessage()).build();
		}
	}

	@GET
	@Path("/{executionSheetId}/photos")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getExecutionSheetPhotosDirect(@PathParam("executionSheetId") String executionSheetId,
			@HeaderParam("Authorization") String authHeader) {
		try {
			LOG.info("Getting photos for execution sheet: " + executionSheetId);
			
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				LOG.warning("User validation failed for photos request");
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			LOG.info("User validated, calling getExecutionSheetPhotos");
			return getExecutionSheetPhotos(executionSheetId, user);

		} catch (Exception e) {
			LOG.severe("Error getting execution sheet photos: " + e.getMessage());
			e.printStackTrace(); // Add stack trace for debugging
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting photos: " + e.getMessage()).build();
		}
	}

	@GET
	@Path("/test-endpoint")
	@Produces(MediaType.APPLICATION_JSON)
	public Response testEndpoint(@HeaderParam("Authorization") String authHeader) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity("Invalid user").build();
			}

			ObjectNode result = mapper.createObjectNode();
			result.put("status", "success");
			result.put("message", "ExecutionSheetResource is working");
			result.put("timestamp", System.currentTimeMillis());
			result.put("user", user.getString(AccountConstants.DS_USERNAME));

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Test endpoint error: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error: " + e.getMessage()).build();
		}
	}

	@GET
	@Path("/photo/{photoId}/serve")
	@Produces("image/*")
	public Response servePhoto(@PathParam("photoId") String photoId,
			@HeaderParam("Authorization") String authHeader) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity("Unauthorized").build();
			}

			// Get photo metadata from datastore
			Key photoKey = datastore.newKeyFactory().setKind("ActivityPhoto").newKey(photoId);
			Entity photo = datastore.get(photoKey);

			// If not found in ActivityPhoto, try ExecutionSheetPhoto
			if (photo == null) {
				photoKey = datastore.newKeyFactory().setKind("ExecutionSheetPhoto").newKey(photoId);
				photo = datastore.get(photoKey);
			}

			if (photo == null) {
				return Response.status(Status.NOT_FOUND).entity("Photo not found").build();
			}

			// Always serve from GCS directly to avoid CORS issues
			String bucketName = "terra-watch-photos";
			String blobName = photoId + ".jpg";

			Storage storage = StorageOptions.getDefaultInstance().getService();
			BlobId blobId = BlobId.of(bucketName, blobName);
			Blob blob = storage.get(blobId);

			if (blob == null) {
				LOG.warning("Photo file not found in storage: " + blobName);
				return Response.status(Status.NOT_FOUND).entity("Photo file not found in storage: " + blobName).build();
			}

			// Read the blob data
			byte[] photoData = blob.getContent();
			String contentType = blob.getContentType();
			if (contentType == null || contentType.isEmpty()) {
				contentType = "image/jpeg";
			}

			return Response.ok(photoData)
					.type(contentType)
					.header("Cache-Control", "public, max-age=3600")
					.header("Access-Control-Allow-Origin", "*")
					.header("Access-Control-Allow-Methods", "GET")
					.header("Access-Control-Allow-Headers", "Authorization")
					.build();

		} catch (Exception e) {
			LOG.severe("Error serving photo: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error serving photo: " + e.getMessage()).build();
		}
	}

	@GET
	@Path("/photo/{photoId}/thumbnail")
	@Produces("image/*")
	public Response servePhotoThumbnail(@PathParam("photoId") String photoId,
			@HeaderParam("Authorization") String authHeader) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity("Unauthorized").build();
			}

			// Get photo metadata from datastore
			Key photoKey = datastore.newKeyFactory().setKind("ActivityPhoto").newKey(photoId);
			Entity photo = datastore.get(photoKey);

			// If not found in ActivityPhoto, try ExecutionSheetPhoto
			if (photo == null) {
				photoKey = datastore.newKeyFactory().setKind("ExecutionSheetPhoto").newKey(photoId);
				photo = datastore.get(photoKey);
			}

			if (photo == null) {
				return Response.status(Status.NOT_FOUND).entity("Photo not found").build();
			}

			// Always serve from GCS directly to avoid CORS issues
			String bucketName = "terra-watch-photos";
			String blobName = photoId + ".jpg";

			Storage storage = StorageOptions.getDefaultInstance().getService();
			BlobId blobId = BlobId.of(bucketName, blobName);
			Blob blob = storage.get(blobId);

			if (blob == null) {
				LOG.warning("Photo file not found in storage for thumbnail: " + blobName);
				return Response.status(Status.NOT_FOUND).entity("Photo file not found in storage: " + blobName).build();
			}

			// Read the blob data
			byte[] photoData = blob.getContent();
			String contentType = blob.getContentType();
			if (contentType == null || contentType.isEmpty()) {
				contentType = "image/jpeg";
			}

			return Response.ok(photoData)
					.type(contentType)
					.header("Cache-Control", "public, max-age=3600")
					.header("Access-Control-Allow-Origin", "*")
					.header("Access-Control-Allow-Methods", "GET")
					.header("Access-Control-Allow-Headers", "Authorization")
					.build();

		} catch (Exception e) {
			LOG.severe("Error serving photo thumbnail: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error serving photo thumbnail: " + e.getMessage()).build();
		}
	}

	// === VIDEO ENDPOINTS ===
	
	@POST
	@Path("/{executionSheetId}/video")
	@Consumes(MediaType.MULTIPART_FORM_DATA)
	@Produces(MediaType.APPLICATION_JSON)
	public Response uploadExecutionSheetVideo(@PathParam("executionSheetId") String executionSheetId,
			@HeaderParam("Authorization") String authHeader,
			@jakarta.ws.rs.core.Context jakarta.servlet.http.HttpServletRequest request) {
		Transaction txn = datastore.newTransaction();
		try {
			List<String> roles = List.of(
					AccountConstants.PARTNER_OPERATOR,
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			// Verify execution sheet exists
			Key esKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_SHEET).newKey(executionSheetId);
			Entity es = txn.get(esKey);

			if (es == null) {
				txn.rollback();
				return Response.status(Status.NOT_FOUND).entity("Execution sheet not found").build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// Parse the uploaded file and description
			jakarta.servlet.http.Part filePart = null;
			jakarta.servlet.http.Part descriptionPart = null;
			try {
				filePart = request.getPart("video");
				descriptionPart = request.getPart("description");
			} catch (Exception e) {
				LOG.severe("Error getting multipart file: " + e.getMessage());
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity("Error parsing multipart data: " + e.getMessage()).build();
			}

			if (filePart == null || filePart.getSize() == 0) {
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity("No video file uploaded").build();
			}

			// Extract description from form data
			String description = "Vídeo da folha de execução"; // default
			if (descriptionPart != null) {
				try {
					byte[] descBytes = descriptionPart.getInputStream().readAllBytes();
					String userDescription = new String(descBytes, "UTF-8").trim();
					if (!userDescription.isEmpty()) {
						description = userDescription;
					}
				} catch (Exception e) {
					LOG.warning("Error reading description: " + e.getMessage());
				}
			}

			byte[] videoBytes = filePart.getInputStream().readAllBytes();

			// Upload to GCS
			Storage storage = StorageOptions.getDefaultInstance().getService();
			String bucketName = "terra-watch-videos";
			String videoId = "video_" + executionSheetId + "_" + System.currentTimeMillis();
			String blobName = videoId + ".mp4";
			BlobId blobId = BlobId.of(bucketName, blobName);
			BlobInfo blobInfo = BlobInfo.newBuilder(blobId).setContentType(filePart.getContentType()).build();

			storage.create(blobInfo, videoBytes);
			storage.createAcl(blobId, Acl.of(Acl.User.ofAllUsers(), Acl.Role.READER));

			String videoUrl = "https://storage.googleapis.com/" + bucketName + "/" + blobName;
			
			// Use fallback thumbnail for videos (generic video thumbnail)
			String thumbnailUrl = "https://storage.googleapis.com/terra-watch-photos/video-placeholder.png";

			Key videoKey = datastore.newKeyFactory().setKind("ExecutionSheetVideo").newKey(videoId);
			Entity video = Entity.newBuilder(videoKey)
					.set("executionSheetId", executionSheetId)
					.set("url", videoUrl)
					.set("thumbnailUrl", thumbnailUrl)
					.set("description", description)
					.set("uploadedBy", username)
					.set("uploadTimestamp", Timestamp.now())
					.set("location", "")
					.build();

			txn.put(video);
			txn.commit();

			// Create notification for execution sheet video
			NotificationResource.createNotification(
					null, // broadcast to all involved
					username,
					"video",
					"Novo vídeo adicionado",
					username + " adicionou um vídeo: " + description,
					executionSheetId);

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("videoId", videoId);
			result.put("url", videoUrl);
			result.put("thumbnailUrl", thumbnailUrl);
			result.put("message", "Vídeo enviado com sucesso");

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive())
				txn.rollback();
			LOG.severe("Error uploading execution sheet video: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error uploading video: " + e.getMessage()).build();
		}
	}

	@GET
	@Path("/{executionSheetId}/videos")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getExecutionSheetVideos(@PathParam("executionSheetId") String executionSheetId,
			@HeaderParam("Authorization") String authHeader) {
		try {
			List<String> roles = List.of(
					AccountConstants.PARTNER_OPERATOR,
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			Query<Entity> query = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetVideo")
					.setFilter(PropertyFilter.eq("executionSheetId", executionSheetId))
					.setOrderBy(OrderBy.desc("uploadTimestamp"))
					.build();

					QueryResults<Entity> results = datastore.run(query);
		ArrayNode videosArray = mapper.createArrayNode();
		String currentUsername = user.getString(AccountConstants.DS_USERNAME);

		while (results.hasNext()) {
			Entity video = results.next();
			ObjectNode videoNode = mapper.createObjectNode();
			videoNode.put("id", video.getKey().getName());
			videoNode.put("url", video.getString("url"));
			
			// Use fallback thumbnail for videos (generic video thumbnail)
			String thumbnailUrl = "https://storage.googleapis.com/terra-watch-photos/video-placeholder.png";
			videoNode.put("thumbnailUrl", thumbnailUrl);
			
			videoNode.put("description", video.getString("description"));
			videoNode.put("uploadedBy", video.getString("uploadedBy"));
			videoNode.put("uploadTimestamp", video.getTimestamp("uploadTimestamp").toString());
			
			// Get likes for this video (consistent with photos)
			Query<Entity> likesQuery = Query.newEntityQueryBuilder()
					.setKind("VideoLike")
					.setFilter(PropertyFilter.eq("videoId", video.getKey().getName()))
					.build();
			QueryResults<Entity> likes = datastore.run(likesQuery);

			int likeCount = 0;
			boolean userLiked = false;
			while (likes.hasNext()) {
				Entity like = likes.next();
				likeCount++;
				if (like.getString("username").equals(currentUsername)) {
					userLiked = true;
				}
			}
			
			videoNode.put("likes", likeCount);
			videoNode.put("userLiked", userLiked);
			videoNode.put("location", video.contains("location") ? video.getString("location") : "");
			
			videosArray.add(videoNode);
		}

		// Make response format consistent with photos endpoint
		ObjectNode result = mapper.createObjectNode();
		result.put("executionSheetId", executionSheetId);
		result.set("videos", videosArray);
		result.put("totalVideos", videosArray.size());

		return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Error getting execution sheet videos: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting videos: " + e.getMessage()).build();
		}
	}

	@GET
	@Path("/recent-videos")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getRecentVideos(@HeaderParam("Authorization") String authHeader,
			@QueryParam("limit") Integer limitParam) {
		try {
			List<String> roles = List.of(
					AccountConstants.PARTNER_OPERATOR,
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			int limit = (limitParam != null && limitParam > 0) ? limitParam : 20;

			Query<Entity> query = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetVideo")
					.setOrderBy(OrderBy.desc("uploadTimestamp"))
					.setLimit(limit)
					.build();

			QueryResults<Entity> results = datastore.run(query);
			ArrayNode videosArray = mapper.createArrayNode();

			while (results.hasNext()) {
				Entity video = results.next();
				ObjectNode videoNode = mapper.createObjectNode();
				videoNode.put("id", video.getKey().getName());
				videoNode.put("url", video.getString("url"));
				
				// Use fallback thumbnail for videos
				String thumbnailUrl = "https://storage.googleapis.com/terra-watch-photos/video-placeholder.png";
				videoNode.put("thumbnailUrl", thumbnailUrl);
				
				videoNode.put("description", video.getString("description"));
				videoNode.put("uploadedBy", video.getString("uploadedBy"));
				videoNode.put("uploadTimestamp", video.getTimestamp("uploadTimestamp").toString());
				videoNode.put("executionSheetId", video.getString("executionSheetId"));
				
				// Get like count for this video
				Query<Entity> likeQuery = Query.newEntityQueryBuilder()
						.setKind("VideoLike")
						.setFilter(PropertyFilter.eq("videoId", video.getKey().getName()))
						.build();
				
				QueryResults<Entity> likeResults = datastore.run(likeQuery);
				int likeCount = 0;
				boolean userLiked = false;
				String currentUsername = user.getString(AccountConstants.DS_USERNAME);
				
				while (likeResults.hasNext()) {
					Entity like = likeResults.next();
					likeCount++;
					if (currentUsername.equals(like.getString("username"))) {
						userLiked = true;
					}
				}
				
				videoNode.put("likes", likeCount);
				videoNode.put("userLiked", userLiked);
				videosArray.add(videoNode);
			}

			return Response.ok(mapper.writeValueAsString(videosArray)).build();

		} catch (Exception e) {
			LOG.severe("Error getting recent videos: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting recent videos: " + e.getMessage()).build();
		}
	}

	@POST
	@Path("/video/{videoId}/like")
	@Produces(MediaType.APPLICATION_JSON)
	public Response toggleVideoLike(@PathParam("videoId") String videoId,
			@HeaderParam("Authorization") String authHeader) {
		Transaction txn = datastore.newTransaction();
		try {
			List<String> roles = List.of(
					AccountConstants.PARTNER_OPERATOR,
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// Check if user already liked this video
			Query<Entity> likeQuery = Query.newEntityQueryBuilder()
					.setKind("VideoLike")
					.setFilter(PropertyFilter.eq("videoId", videoId))
					.setFilter(PropertyFilter.eq("username", username))
					.build();

			QueryResults<Entity> likeResults = txn.run(likeQuery);
			boolean alreadyLiked = likeResults.hasNext();

			if (alreadyLiked) {
				// Remove like
				Entity existingLike = likeResults.next();
				txn.delete(existingLike.getKey());
			} else {
				// Add like
				String likeId = "like_" + videoId + "_" + username + "_" + System.currentTimeMillis();
				Key likeKey = datastore.newKeyFactory().setKind("VideoLike").newKey(likeId);
				Entity like = Entity.newBuilder(likeKey)
						.set("videoId", videoId)
						.set("username", username)
						.set("timestamp", Timestamp.now())
						.build();
				txn.put(like);
			}

			txn.commit();

			// Get updated like count
			Query<Entity> countQuery = Query.newEntityQueryBuilder()
					.setKind("VideoLike")
					.setFilter(PropertyFilter.eq("videoId", videoId))
					.build();

			QueryResults<Entity> countResults = datastore.run(countQuery);
			int likeCount = 0;
			while (countResults.hasNext()) {
				countResults.next();
				likeCount++;
			}

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("liked", !alreadyLiked);
			result.put("likeCount", likeCount);

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive())
				txn.rollback();
			LOG.severe("Error toggling video like: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error toggling video like: " + e.getMessage()).build();
		}
	}

	@GET
	@Path("/video/{videoId}/serve")
	@Produces("video/*")
	public Response serveVideo(@PathParam("videoId") String videoId,
			@HeaderParam("Authorization") String authHeader) {
		try {
			List<String> roles = List.of(
					AccountConstants.PARTNER_OPERATOR,
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			Storage storage = StorageOptions.getDefaultInstance().getService();
			String bucketName = "terra-watch-videos";
			String blobName = videoId + ".mp4";
			BlobId blobId = BlobId.of(bucketName, blobName);

			Blob blob = storage.get(blobId);
			if (blob == null || !blob.exists()) {
				return Response.status(Status.NOT_FOUND).entity("Video not found").build();
			}

			byte[] videoData = blob.getContent();
			String contentType = blob.getContentType();
			if (contentType == null || contentType.isEmpty()) {
				contentType = "video/mp4";
			}

			return Response.ok(videoData)
					.type(contentType)
					.header("Cache-Control", "public, max-age=3600")
					.header("Access-Control-Allow-Origin", "*")
					.header("Access-Control-Allow-Methods", "GET")
					.header("Access-Control-Allow-Headers", "Authorization")
					.build();

		} catch (Exception e) {
			LOG.severe("Error serving video: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error serving video: " + e.getMessage()).build();
		}
	}

	// === UNIFIED SOCIAL SYSTEM ===
	
	@GET
	@Path("/social-feed")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getUnifiedSocialFeed(@HeaderParam("Authorization") String authHeader,
			@QueryParam("executionSheetId") String executionSheetId,
			@QueryParam("limit") Integer limitParam) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String currentUsername = user.getString(AccountConstants.DS_USERNAME);
			int limit = (limitParam != null && limitParam > 0) ? limitParam : 50;
			ArrayNode posts = mapper.createArrayNode();

			// Get photos as posts (excluding those associated with activity posts)
			Query<Entity> photosQuery = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetPhoto")
					.setOrderBy(OrderBy.desc("uploadTimestamp"))
					.setLimit(limit / 2)
					.build();

			QueryResults<Entity> photos = datastore.run(photosQuery);
			while (photos.hasNext()) {
				Entity photo = photos.next();
				
				// Skip if filtering by execution sheet and doesn't match
				if (executionSheetId != null && !executionSheetId.equals(photo.getString("executionSheetId"))) {
					continue;
				}
				
				// Skip photos that are associated with activity posts to avoid duplication
				if (photo.contains("activityPostId") && photo.getString("activityPostId") != null) {
					continue;
				}
				
				// Skip photos that are flagged as activity media
				if (photo.contains("isActivityMedia") && photo.getBoolean("isActivityMedia")) {
					continue;
				}
				
				ObjectNode post = mapper.createObjectNode();
				post.put("id", "photo_" + photo.getKey().getName());
				post.put("type", "photo");
				post.put("mediaType", "image");
				post.put("photoId", photo.getKey().getName());
				post.put("executionSheetId", photo.getString("executionSheetId"));
				post.put("description", photo.getString("description"));
				post.put("uploadedBy", photo.getString("uploadedBy"));
				post.put("timestamp", photo.getTimestamp("uploadTimestamp").toString());
				post.put("photoUrl", photo.getString("url"));
				post.put("thumbnailUrl", photo.getString("thumbnailUrl"));

				// Get likes
				Query<Entity> likesQuery = Query.newEntityQueryBuilder()
						.setKind("PhotoLike")
						.setFilter(PropertyFilter.eq("photoId", photo.getKey().getName()))
						.build();
				QueryResults<Entity> likes = datastore.run(likesQuery);
				int likeCount = 0;
				boolean userLiked = false;
				while (likes.hasNext()) {
					Entity like = likes.next();
					likeCount++;
					if (currentUsername.equals(like.getString("username"))) {
						userLiked = true;
					}
				}
				post.put("likes", likeCount);
				post.put("userLiked", userLiked);

				// Get comments count
				Query<Entity> commentsQuery = Query.newEntityQueryBuilder()
						.setKind("SocialComment")
						.setFilter(PropertyFilter.eq("postId", "photo_" + photo.getKey().getName()))
						.build();
				QueryResults<Entity> comments = datastore.run(commentsQuery);
				int commentCount = 0;
				while (comments.hasNext()) {
					comments.next();
					commentCount++;
				}
				post.put("comments", commentCount);

				posts.add(post);
			}

			// Get videos as posts (excluding those associated with activity posts)
			Query<Entity> videosQuery = Query.newEntityQueryBuilder()
					.setKind("ExecutionSheetVideo")
					.setOrderBy(OrderBy.desc("uploadTimestamp"))
					.setLimit(limit / 2)
					.build();

			QueryResults<Entity> videos = datastore.run(videosQuery);
			while (videos.hasNext()) {
				Entity video = videos.next();
				
				// Skip if filtering by execution sheet and doesn't match
				if (executionSheetId != null && !executionSheetId.equals(video.getString("executionSheetId"))) {
					continue;
				}
				
				// Skip videos that are associated with activity posts to avoid duplication
				if (video.contains("activityPostId") && video.getString("activityPostId") != null) {
					continue;
				}
				
				// Skip videos that are flagged as activity media
				if (video.contains("isActivityMedia") && video.getBoolean("isActivityMedia")) {
					continue;
				}
				
				ObjectNode post = mapper.createObjectNode();
				post.put("id", "video_" + video.getKey().getName());
				post.put("type", "video");
				post.put("mediaType", "video");
				post.put("videoId", video.getKey().getName());
				post.put("executionSheetId", video.getString("executionSheetId"));
				post.put("description", video.getString("description"));
				post.put("uploadedBy", video.getString("uploadedBy"));
				post.put("timestamp", video.getTimestamp("uploadTimestamp").toString());
				post.put("videoUrl", video.getString("url"));
				post.put("thumbnailUrl", "https://storage.googleapis.com/terra-watch-photos/video-placeholder.png");

				// Get likes
				Query<Entity> likesQuery = Query.newEntityQueryBuilder()
						.setKind("VideoLike")
						.setFilter(PropertyFilter.eq("videoId", video.getKey().getName()))
						.build();
				QueryResults<Entity> likes = datastore.run(likesQuery);
				int likeCount = 0;
				boolean userLiked = false;
				while (likes.hasNext()) {
					Entity like = likes.next();
					likeCount++;
					if (currentUsername.equals(like.getString("username"))) {
						userLiked = true;
					}
				}
				post.put("likes", likeCount);
				post.put("userLiked", userLiked);

				// Get comments count
				Query<Entity> commentsQuery = Query.newEntityQueryBuilder()
						.setKind("SocialComment")
						.setFilter(PropertyFilter.eq("postId", "video_" + video.getKey().getName()))
						.build();
				QueryResults<Entity> comments = datastore.run(commentsQuery);
				int commentCount = 0;
				while (comments.hasNext()) {
					comments.next();
					commentCount++;
				}
				post.put("comments", commentCount);

				posts.add(post);
			}

			// Get text posts
			Query<Entity> textPostsQuery = Query.newEntityQueryBuilder()
					.setKind("SocialPost")
					.setOrderBy(OrderBy.desc("timestamp"))
					.setLimit(limit / 4)
					.build();

			QueryResults<Entity> textPosts = datastore.run(textPostsQuery);
			while (textPosts.hasNext()) {
				Entity textPost = textPosts.next();
				
				// Skip if filtering by execution sheet and doesn't match
				if (executionSheetId != null && !executionSheetId.equals(textPost.getString("executionSheetId"))) {
					continue;
				}
				
				ObjectNode post = mapper.createObjectNode();
				post.put("id", "post_" + textPost.getKey().getName());
				post.put("type", "text");
				post.put("postId", textPost.getKey().getName());
				post.put("executionSheetId", textPost.getString("executionSheetId"));
				post.put("description", textPost.getString("content"));
				post.put("uploadedBy", textPost.getString("author"));
				post.put("timestamp", textPost.getTimestamp("timestamp").toString());

				// Get likes
				Query<Entity> likesQuery = Query.newEntityQueryBuilder()
						.setKind("PostLike")
						.setFilter(PropertyFilter.eq("postId", textPost.getKey().getName()))
						.build();
				QueryResults<Entity> likes = datastore.run(likesQuery);
				int likeCount = 0;
				boolean userLiked = false;
				while (likes.hasNext()) {
					Entity like = likes.next();
					likeCount++;
					if (currentUsername.equals(like.getString("username"))) {
						userLiked = true;
					}
				}
				post.put("likes", likeCount);
				post.put("userLiked", userLiked);

				// Get comments count
				Query<Entity> commentsQuery = Query.newEntityQueryBuilder()
						.setKind("SocialComment")
						.setFilter(PropertyFilter.eq("postId", "post_" + textPost.getKey().getName()))
						.build();
				QueryResults<Entity> comments = datastore.run(commentsQuery);
				int commentCount = 0;
				while (comments.hasNext()) {
					comments.next();
					commentCount++;
				}
				post.put("comments", commentCount);

				posts.add(post);
			}

			// Get activity posts
			Query<Entity> activityPostsQuery = Query.newEntityQueryBuilder()
					.setKind("SocialActivityPost")
					.setOrderBy(OrderBy.desc("timestamp"))
					.setLimit(limit / 4)
					.build();

			QueryResults<Entity> activityPosts = datastore.run(activityPostsQuery);
			while (activityPosts.hasNext()) {
				Entity activityPost = activityPosts.next();
				
				// Skip if filtering by execution sheet and doesn't match
				if (executionSheetId != null && !executionSheetId.equals(activityPost.getString("executionSheetId"))) {
					continue;
				}
				
				ObjectNode post = mapper.createObjectNode();
				post.put("id", "activity_" + activityPost.getKey().getName());
				post.put("type", "activity");
				post.put("postId", activityPost.getKey().getName());
				post.put("executionSheetId", activityPost.getString("executionSheetId"));
				post.put("description", activityPost.getString("content"));
				post.put("uploadedBy", activityPost.getString("author"));
				post.put("timestamp", activityPost.getTimestamp("timestamp").toString());
				post.put("operationCode", activityPost.getString("operationCode"));
				post.put("operationDescription", activityPost.getString("operationDescription"));
				post.put("progressPercentage", activityPost.contains("progressPercentage") ? 
					activityPost.getDouble("progressPercentage") : 0.0);
				post.put("totalProgressPercentage", activityPost.contains("totalProgressPercentage") ? 
					activityPost.getDouble("totalProgressPercentage") : 
					(activityPost.contains("progressPercentage") ? activityPost.getDouble("progressPercentage") : 0.0));
				post.put("areaHa", activityPost.contains("areaHa") ? 
					activityPost.getDouble("areaHa") : 0.0);

				// Get associated media for this activity post (only media that belongs to this specific post)
				ArrayNode mediaArray = mapper.createArrayNode();
				
				// Check for photos associated with this specific activity post
				Query<Entity> mediaQuery = Query.newEntityQueryBuilder()
						.setKind("ExecutionSheetPhoto")
						.setFilter(PropertyFilter.eq("activityPostId", activityPost.getKey().getName()))
						.setFilter(PropertyFilter.eq("isActivityMedia", true))
						.build();
				QueryResults<Entity> mediaResults = datastore.run(mediaQuery);
				
				while (mediaResults.hasNext()) {
					Entity media = mediaResults.next();
					// Double check that this media belongs to this specific post
					if (media.getString("activityPostId").equals(activityPost.getKey().getName())) {
						ObjectNode mediaNode = mapper.createObjectNode();
						mediaNode.put("url", media.getString("url"));
						mediaNode.put("thumbnailUrl", media.getString("thumbnailUrl"));
						mediaNode.put("description", media.getString("description"));
						mediaArray.add(mediaNode);
					}
				}
				
				// Check for videos associated with this specific activity post
				Query<Entity> videoQuery = Query.newEntityQueryBuilder()
						.setKind("ExecutionSheetVideo")
						.setFilter(PropertyFilter.eq("activityPostId", activityPost.getKey().getName()))
						.setFilter(PropertyFilter.eq("isActivityMedia", true))
						.build();
				QueryResults<Entity> videoResults = datastore.run(videoQuery);
				
				while (videoResults.hasNext()) {
					Entity video = videoResults.next();
					// Double check that this video belongs to this specific post
					if (video.getString("activityPostId").equals(activityPost.getKey().getName())) {
						ObjectNode videoNode = mapper.createObjectNode();
						videoNode.put("url", video.getString("url"));
						videoNode.put("thumbnailUrl", video.getString("thumbnailUrl"));
						videoNode.put("description", video.getString("description"));
						videoNode.put("type", "video");
						mediaArray.add(videoNode);
					}
				}
				
				if (mediaArray.size() > 0) {
					post.set("media", mediaArray);
				}

				// Get likes
				Query<Entity> likesQuery = Query.newEntityQueryBuilder()
						.setKind("ActivityPostLike")
						.setFilter(PropertyFilter.eq("postId", activityPost.getKey().getName()))
						.build();
				QueryResults<Entity> likes = datastore.run(likesQuery);
				int likeCount = 0;
				boolean userLiked = false;
				while (likes.hasNext()) {
					Entity like = likes.next();
					likeCount++;
					if (currentUsername.equals(like.getString("username"))) {
						userLiked = true;
					}
				}
				post.put("likes", likeCount);
				post.put("userLiked", userLiked);

				// Get comments count
				Query<Entity> commentsQuery = Query.newEntityQueryBuilder()
						.setKind("SocialComment")
						.setFilter(PropertyFilter.eq("postId", "activity_" + activityPost.getKey().getName()))
						.build();
				QueryResults<Entity> comments = datastore.run(commentsQuery);
				int commentCount = 0;
				while (comments.hasNext()) {
					comments.next();
					commentCount++;
				}
				post.put("comments", commentCount);

				posts.add(post);
			}

			return Response.ok(mapper.writeValueAsString(posts)).build();

		} catch (Exception e) {
			LOG.severe("Error getting unified social feed: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting social feed: " + e.getMessage()).build();
		}
	}

	@POST
	@Path("/social/comment")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response addComment(@HeaderParam("Authorization") String authHeader, String commentDataJson) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			JsonNode commentData;
			try {
				commentData = mapper.readTree(commentDataJson);
			} catch (JsonProcessingException e) {
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity("Invalid JSON").build();
			}

			String postId = commentData.get("postId").asText();
			String content = commentData.get("content").asText();
			String parentCommentId = commentData.has("parentCommentId") ? commentData.get("parentCommentId").asText() : null;

			String commentId = "comment_" + System.currentTimeMillis() + "_" + username;
			Key commentKey = datastore.newKeyFactory().setKind("SocialComment").newKey(commentId);
			
			Entity.Builder commentBuilder = Entity.newBuilder(commentKey)
					.set("postId", postId)
					.set("content", content)
					.set("author", username)
					.set("timestamp", Timestamp.now());
			
			if (parentCommentId != null) {
				commentBuilder.set("parentCommentId", parentCommentId);
			}
			
			Entity comment = commentBuilder.build();
			txn.put(comment);
			txn.commit();

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("commentId", commentId);
			result.put("message", "Comentário adicionado com sucesso");

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive())
				txn.rollback();
			LOG.severe("Error adding comment: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error adding comment: " + e.getMessage()).build();
		}
	}

	@GET
	@Path("/social/comments/{postId}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getComments(@PathParam("postId") String postId, @HeaderParam("Authorization") String authHeader) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String currentUsername = user.getString(AccountConstants.DS_USERNAME);

			Query<Entity> commentsQuery = Query.newEntityQueryBuilder()
					.setKind("SocialComment")
					.setFilter(PropertyFilter.eq("postId", postId))
					// Temporarily remove ordering until index is deployed
					// .setOrderBy(OrderBy.asc("timestamp"))
					.build();

			QueryResults<Entity> comments = datastore.run(commentsQuery);
			ArrayNode commentsArray = mapper.createArrayNode();

			while (comments.hasNext()) {
				Entity comment = comments.next();
				ObjectNode commentNode = mapper.createObjectNode();
				
				commentNode.put("id", comment.getKey().getName());
				commentNode.put("postId", comment.getString("postId"));
				commentNode.put("content", comment.getString("content"));
				commentNode.put("author", comment.getString("author"));
				commentNode.put("timestamp", comment.getTimestamp("timestamp").toString());
				
				if (comment.contains("parentCommentId")) {
					commentNode.put("parentCommentId", comment.getString("parentCommentId"));
				}

				// Get likes for this comment
				Query<Entity> likesQuery = Query.newEntityQueryBuilder()
						.setKind("CommentLike")
						.setFilter(PropertyFilter.eq("commentId", comment.getKey().getName()))
						.build();
				QueryResults<Entity> likes = datastore.run(likesQuery);
				int likeCount = 0;
				boolean userLiked = false;
				while (likes.hasNext()) {
					Entity like = likes.next();
					likeCount++;
					if (currentUsername.equals(like.getString("username"))) {
						userLiked = true;
					}
				}
				commentNode.put("likes", likeCount);
				commentNode.put("userLiked", userLiked);

				commentsArray.add(commentNode);
			}

			return Response.ok(mapper.writeValueAsString(commentsArray)).build();

		} catch (Exception e) {
			LOG.severe("Error getting comments: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting comments: " + e.getMessage()).build();
		}
	}

	@POST
	@Path("/social/comment/{commentId}/like")
	@Produces(MediaType.APPLICATION_JSON)
	public Response toggleCommentLike(@PathParam("commentId") String commentId, @HeaderParam("Authorization") String authHeader) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// Check if user already liked this comment
			Query<Entity> likeQuery = Query.newEntityQueryBuilder()
					.setKind("CommentLike")
					.setFilter(PropertyFilter.eq("commentId", commentId))
					.setFilter(PropertyFilter.eq("username", username))
					.build();

			QueryResults<Entity> likeResults = txn.run(likeQuery);
			boolean alreadyLiked = likeResults.hasNext();

			if (alreadyLiked) {
				// Remove like
				Entity existingLike = likeResults.next();
				txn.delete(existingLike.getKey());
			} else {
				// Add like
				String likeId = "like_" + commentId + "_" + username + "_" + System.currentTimeMillis();
				Key likeKey = datastore.newKeyFactory().setKind("CommentLike").newKey(likeId);
				Entity like = Entity.newBuilder(likeKey)
						.set("commentId", commentId)
						.set("username", username)
						.set("timestamp", Timestamp.now())
						.build();
				txn.put(like);
			}

			txn.commit();

			// Get updated like count
			Query<Entity> countQuery = Query.newEntityQueryBuilder()
					.setKind("CommentLike")
					.setFilter(PropertyFilter.eq("commentId", commentId))
					.build();

			QueryResults<Entity> countResults = datastore.run(countQuery);
			int likeCount = 0;
			while (countResults.hasNext()) {
				countResults.next();
				likeCount++;
			}

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("liked", !alreadyLiked);
			result.put("likeCount", likeCount);

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive())
				txn.rollback();
			LOG.severe("Error toggling comment like: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error toggling comment like: " + e.getMessage()).build();
		}
	}

	@POST
	@Path("/social/text-post")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response createTextPost(@HeaderParam("Authorization") String authHeader, String postDataJson) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			JsonNode postData;
			try {
				postData = mapper.readTree(postDataJson);
			} catch (JsonProcessingException e) {
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity("Invalid JSON").build();
			}

			String content = postData.get("content").asText();
			String executionSheetId = postData.get("executionSheetId").asText();

			String postId = "textpost_" + System.currentTimeMillis() + "_" + username;
			Key postKey = datastore.newKeyFactory().setKind("SocialPost").newKey(postId);
			
			Entity post = Entity.newBuilder(postKey)
					.set("content", content)
					.set("author", username)
					.set("executionSheetId", executionSheetId)
					.set("timestamp", Timestamp.now())
					.build();
			
			txn.put(post);
			txn.commit();

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("postId", postId);
			result.put("message", "Post criado com sucesso");

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive())
				txn.rollback();
			LOG.severe("Error creating text post: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error creating text post: " + e.getMessage()).build();
		}
	}

	@POST
	@Path("/social/text-post/{postId}/like")
	@Produces(MediaType.APPLICATION_JSON)
	public Response toggleTextPostLike(@PathParam("postId") String postId, @HeaderParam("Authorization") String authHeader) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// Check if user already liked this text post
			Query<Entity> likeQuery = Query.newEntityQueryBuilder()
					.setKind("PostLike")
					.setFilter(PropertyFilter.eq("postId", postId))
					.setFilter(PropertyFilter.eq("username", username))
					.build();

			QueryResults<Entity> likeResults = txn.run(likeQuery);
			boolean alreadyLiked = likeResults.hasNext();

			if (alreadyLiked) {
				// Remove like
				Entity existingLike = likeResults.next();
				txn.delete(existingLike.getKey());
			} else {
				// Add like
				String likeId = "like_" + postId + "_" + username + "_" + System.currentTimeMillis();
				Key likeKey = datastore.newKeyFactory().setKind("PostLike").newKey(likeId);
				Entity like = Entity.newBuilder(likeKey)
						.set("postId", postId)
						.set("username", username)
						.set("timestamp", Timestamp.now())
						.build();
				txn.put(like);
			}

			txn.commit();

			// Get updated like count
			Query<Entity> countQuery = Query.newEntityQueryBuilder()
					.setKind("PostLike")
					.setFilter(PropertyFilter.eq("postId", postId))
					.build();

			QueryResults<Entity> countResults = datastore.run(countQuery);
			int likeCount = 0;
			while (countResults.hasNext()) {
				countResults.next();
				likeCount++;
			}

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("liked", !alreadyLiked);
			result.put("likeCount", likeCount);

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive())
				txn.rollback();
			LOG.severe("Error toggling text post like: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error toggling text post like: " + e.getMessage()).build();
		}
	}

	@GET
	@Path("/{executionSheetId}/operations")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getWorksheetOperations(@PathParam("executionSheetId") String executionSheetId,
			@HeaderParam("Authorization") String authHeader) {
		try {
			List<String> roles = List.of(
					AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE,
					AccountConstants.PARTNER_OPERATOR,
					AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE,
					AccountConstants.SHEET_GENERAL_VIEWER_BACKOFFICE,
					AccountConstants.SHEET_MANAGER_BACKOFFICE,
					AccountConstants.SYSTEM_ADMIN_ROLE,
					AccountConstants.SYSTEM_BACKOFFICE_ROLE);

			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, roles);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			// Extract worksheet ID from execution sheet ID
			String worksheetIdStr = executionSheetId.replace("execution_", "");
			if (worksheetIdStr.isEmpty()) {
				LOG.warning("Invalid executionSheetId: " + executionSheetId + " - empty worksheet ID");
				return Response.status(Status.BAD_REQUEST).entity("Invalid execution sheet ID format").build();
			}

			Long worksheetId;
			try {
				worksheetId = Long.parseLong(worksheetIdStr);
			} catch (NumberFormatException e) {
				LOG.warning("Invalid worksheet ID format: " + worksheetIdStr);
				return Response.status(Status.BAD_REQUEST).entity("Invalid worksheet ID").build();
			}

			// Get operations for this worksheet
			Query<Entity> operationsQuery = Query.newEntityQueryBuilder()
					.setKind(WorkSheetConstants.WS_OPERATION)
					.setFilter(PropertyFilter.eq(WorkSheetConstants.WS_OP_WSID, worksheetId))
					.build();
			QueryResults<Entity> operations = datastore.run(operationsQuery);

			ArrayNode operationsArray = mapper.createArrayNode();
			while (operations.hasNext()) {
				Entity operation = operations.next();
				String operationCode = operation.getString(WorkSheetConstants.WS_OP_OPC);
				
				// Get current progress for this operation in the execution sheet
				String operationId = executionSheetId + "_" + operationCode;
				Key opKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_OPERATION).newKey(operationId);
				Entity execOperation = datastore.get(opKey);
				
				ObjectNode operationNode = mapper.createObjectNode();
				operationNode.put("code", operationCode);
				operationNode.put("description", operation.getString(WorkSheetConstants.WS_OP_OPD));
				operationNode.put("areaHa", operation.getDouble(WorkSheetConstants.WS_OP_AHA));
				
				// Add current progress if available
				if (execOperation != null && execOperation.contains(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT)) {
					double progress = execOperation.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT);
					operationNode.put("progressPercentage", progress);
					operationNode.put("isCompleted", progress >= 100.0);
				} else {
					operationNode.put("progressPercentage", 0.0);
					operationNode.put("isCompleted", false);
				}
				
				operationsArray.add(operationNode);
			}

			ObjectNode result = mapper.createObjectNode();
			result.put("executionSheetId", executionSheetId);
			result.put("worksheetId", worksheetId);
			result.set("operations", operationsArray);

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Error getting worksheet operations: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error getting worksheet operations").build();
		}
	}

	@POST
	@Path("/social/activity-post")
	@Consumes(MediaType.MULTIPART_FORM_DATA)
	@Produces(MediaType.APPLICATION_JSON)
	public Response createActivityPost(@HeaderParam("Authorization") String authHeader,
			@jakarta.ws.rs.core.Context jakarta.servlet.http.HttpServletRequest request) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// Parse multipart form data
			String content = request.getParameter("content");
			String executionSheetId = request.getParameter("executionSheetId");
			String operationCode = request.getParameter("operationCode");
			String operationDescription = request.getParameter("operationDescription");
			String progressPercentageStr = request.getParameter("progressPercentage");
			
			if (content == null) content = "";
			if (progressPercentageStr == null) progressPercentageStr = "0.0";
			
			double progressPercentage = Double.parseDouble(progressPercentageStr);

			// Validate progress percentage
			if (progressPercentage < 0 || progressPercentage > 100) {
				txn.rollback();
				return Response.status(Status.BAD_REQUEST).entity("Progress percentage must be between 0 and 100").build();
			}

			// Calculate area in hectares based on progress percentage
			double areaHa = 0.0;
			double totalProgress = 0.0;
			try {
				// Get the operation to get its total area
				String operationId = executionSheetId + "_" + operationCode;
				Key opKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_OPERATION).newKey(operationId);
				Entity operation = txn.get(opKey);
				
				if (operation != null) {
					// Check if operation is already completed
					if (operation.contains(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT)) {
						double currentProgress = operation.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT);
						if (currentProgress >= 100.0) {
							txn.rollback();
							return Response.status(Status.BAD_REQUEST).entity("Esta operação já foi concluída (100%). Não é possível adicionar mais atividades.").build();
						}
						// Calculate total progress (current + additional)
						totalProgress = Math.min(100.0, currentProgress + progressPercentage);
					} else {
						totalProgress = progressPercentage;
					}
					
					double totalAreaHa = operation.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_HA);
					// Calculate the area covered by this progress percentage
					areaHa = (totalAreaHa * progressPercentage) / 100.0;
				}
			} catch (Exception e) {
				LOG.warning("Could not calculate area for operation: " + operationCode + " - " + e.getMessage());
			}

			String postId = "activitypost_" + System.currentTimeMillis() + "_" + username;
			Key postKey = datastore.newKeyFactory().setKind("SocialActivityPost").newKey(postId);
			
			Entity post = Entity.newBuilder(postKey)
					.set("content", content)
					.set("author", username)
					.set("executionSheetId", executionSheetId)
					.set("operationCode", operationCode)
					.set("operationDescription", operationDescription)
					.set("progressPercentage", progressPercentage)
					.set("totalProgressPercentage", totalProgress)
					.set("areaHa", areaHa)
					.set("timestamp", Timestamp.now())
					.build();
			
			txn.put(post);

			// Update execution sheet progress
			updateExecutionSheetProgress(txn, executionSheetId, operationCode, progressPercentage);

			// Handle media uploads if any
			List<String> mediaUrls = new ArrayList<>();
			jakarta.servlet.http.Part filePart = request.getPart("media");
			if (filePart != null && filePart.getSize() > 0) {
				// Upload the media and associate it with the activity post
				String mediaUrl = uploadActivityMedia(filePart, postId, username, content);
				if (mediaUrl != null) {
					mediaUrls.add(mediaUrl);
				}
			}
			
			// Also check for multiple media files
			Collection<jakarta.servlet.http.Part> fileParts = request.getParts();
			for (jakarta.servlet.http.Part part : fileParts) {
				if (part.getName().equals("media") && part.getSize() > 0) {
					String mediaUrl = uploadActivityMedia(part, postId, username, content);
					if (mediaUrl != null && !mediaUrls.contains(mediaUrl)) {
						mediaUrls.add(mediaUrl);
					}
				}
			}

			txn.commit();

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("postId", postId);
			result.put("areaHa", areaHa);
			result.put("message", "Post de atividade criado com sucesso");
			if (!mediaUrls.isEmpty()) {
				ArrayNode mediaArray = result.putArray("mediaUrls");
				for (String url : mediaUrls) {
					mediaArray.add(url);
				}
			}

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive())
				txn.rollback();
			LOG.severe("Error creating activity post: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error creating activity post: " + e.getMessage()).build();
		}
	}

	// Helper method to upload media for activity posts
	private String uploadActivityMedia(jakarta.servlet.http.Part filePart, String postId, String username, String description) {
		try {
			String fileName = getSubmittedFileName(filePart);
			String fileExtension = fileName.substring(fileName.lastIndexOf(".") + 1).toLowerCase();
			
			// Generate unique media ID
			String mediaId = "activitymedia_" + System.currentTimeMillis() + "_" + username;
			
			// Determine if it's a video
			boolean isVideo = fileExtension.matches("mp4|avi|mov|wmv|flv|webm");
			
			// Upload to Google Cloud Storage using existing bucket
			String bucketName = "terra-watch-photos";
			String gcsFileName = "activity-media/" + mediaId + "." + fileExtension;
			
			Storage storage = StorageOptions.getDefaultInstance().getService();
			Bucket bucket = storage.get(bucketName);
			
			// Upload the file
			Blob blob = bucket.create(gcsFileName, filePart.getInputStream().readAllBytes(), filePart.getContentType());
			String mediaUrl = "https://storage.googleapis.com/" + bucketName + "/" + gcsFileName;
			
			// Create thumbnail for videos
			String thumbnailUrl = null;
			if (isVideo) {
				thumbnailUrl = "https://storage.googleapis.com/terra-watch-photos/video-placeholder.png";
			} else {
				thumbnailUrl = mediaUrl; // For photos, use the same URL as thumbnail
			}
			
			// Store media metadata in Datastore
			Key mediaKey = datastore.newKeyFactory().setKind(isVideo ? "ExecutionSheetVideo" : "ExecutionSheetPhoto").newKey(mediaId);
			Entity mediaEntity = Entity.newBuilder(mediaKey)
					.set("url", mediaUrl)
					.set("thumbnailUrl", thumbnailUrl)
					.set("description", description)
					.set("uploadedBy", username)
					.set("uploadTimestamp", Timestamp.now())
					.set("executionSheetId", postId) // Link to the activity post
					.set("activityPostId", postId) // Additional reference to prevent showing as separate posts
					.set("isActivityMedia", true) // Flag to identify media from activity posts
					.build();
			
			datastore.put(mediaEntity);
			
			return mediaUrl;
			
		} catch (Exception e) {
			LOG.severe("Error uploading activity media: " + e.getMessage());
			return null;
		}
	}

	// Helper method to get submitted file name
	private String getSubmittedFileName(jakarta.servlet.http.Part part) {
		String contentDisp = part.getHeader("content-disposition");
		String[] tokens = contentDisp.split(";");
		for (String token : tokens) {
			if (token.trim().startsWith("filename")) {
				return token.substring(token.indexOf("=") + 2, token.length() - 1);
			}
		}
		return "";
	}

	// Update execution sheet progress based on activity
	private void updateExecutionSheetProgress(Transaction txn, String executionSheetId, String operationCode, double progressPercentage) {
		try {
			// Get execution sheet
			Key esKey = esKeyFactory.newKey(executionSheetId);
			Entity executionSheet = txn.get(esKey);
			
			if (executionSheet == null) {
				LOG.warning("Execution sheet not found: " + executionSheetId);
				return;
			}

			// Update execution sheet start date if not set
			if (!executionSheet.contains(ExecutionSheetConstants.ES_START_DATETIME)) {
				Entity.Builder esBuilder = Entity.newBuilder(executionSheet)
						.set(ExecutionSheetConstants.ES_START_DATETIME, Timestamp.now());
				txn.update(esBuilder.build());
			}

			// Update last activity date
			Entity.Builder esBuilder = Entity.newBuilder(executionSheet)
					.set(ExecutionSheetConstants.ES_LAST_ACTIVITY_DATETIME, Timestamp.now());
			txn.update(esBuilder.build());

			// Update operation progress
			String operationId = executionSheetId + "_" + operationCode;
			Key opKey = datastore.newKeyFactory().setKind(ExecutionSheetConstants.EXEC_OPERATION).newKey(operationId);
			Entity operation = txn.get(opKey);
			
			if (operation != null) {
				// Get current progress from operation
				double currentProgress = 0.0;
				if (operation.contains(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT)) {
					currentProgress = operation.getDouble(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT);
				}
				
				// Calculate new cumulative progress (don't exceed 100%)
				double newProgress = Math.min(100.0, currentProgress + progressPercentage);
				
				// Update operation progress
				Entity.Builder opBuilder = Entity.newBuilder(operation)
						.set(ExecutionSheetConstants.EO_LAST_ACTIVITY_DATETIME, Timestamp.now())
						.set(ExecutionSheetConstants.EO_TOTAL_AREA_PERCENT, newProgress);
				
				// Set start date if not set
				if (!operation.contains(ExecutionSheetConstants.EO_START_DATETIME)) {
					opBuilder.set(ExecutionSheetConstants.EO_START_DATETIME, Timestamp.now());
				}
				
				// Set end date if progress is 100%
				if (newProgress >= 100.0) {
					opBuilder.set(ExecutionSheetConstants.EO_END_DATETIME, Timestamp.now());
				}
				
				txn.update(opBuilder.build());
			}

		} catch (Exception e) {
			LOG.severe("Error updating execution sheet progress: " + e.getMessage());
		}
	}

	@POST
	@Path("/social/activity-post/{postId}/like")
	@Produces(MediaType.APPLICATION_JSON)
	public Response toggleActivityPostLike(@PathParam("postId") String postId, @HeaderParam("Authorization") String authHeader) {
		Transaction txn = datastore.newTransaction();
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				txn.rollback();
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
			}

			String username = user.getString(AccountConstants.DS_USERNAME);

			// Check if user already liked this activity post
			Query<Entity> likeQuery = Query.newEntityQueryBuilder()
					.setKind("ActivityPostLike")
					.setFilter(PropertyFilter.eq("postId", postId))
					.setFilter(PropertyFilter.eq("username", username))
					.build();

			QueryResults<Entity> likeResults = txn.run(likeQuery);
			boolean alreadyLiked = likeResults.hasNext();

			if (alreadyLiked) {
				// Remove like
				Entity existingLike = likeResults.next();
				txn.delete(existingLike.getKey());
			} else {
				// Add like
				String likeId = "activitylike_" + postId + "_" + username + "_" + System.currentTimeMillis();
				Key likeKey = datastore.newKeyFactory().setKind("ActivityPostLike").newKey(likeId);
				Entity like = Entity.newBuilder(likeKey)
						.set("postId", postId)
						.set("username", username)
						.set("timestamp", Timestamp.now())
						.build();
				txn.put(like);
			}

			txn.commit();

			// Get updated like count
			Query<Entity> countQuery = Query.newEntityQueryBuilder()
					.setKind("ActivityPostLike")
					.setFilter(PropertyFilter.eq("postId", postId))
					.build();

			QueryResults<Entity> countResults = datastore.run(countQuery);
			int likeCount = 0;
			while (countResults.hasNext()) {
				countResults.next();
				likeCount++;
			}

			ObjectNode result = mapper.createObjectNode();
			result.put("success", true);
			result.put("liked", !alreadyLiked);
			result.put("likeCount", likeCount);

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			if (txn.isActive())
				txn.rollback();
			LOG.severe("Error toggling activity post like: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Error toggling activity post like: " + e.getMessage()).build();
		}
	}
}
