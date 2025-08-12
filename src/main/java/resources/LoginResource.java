package resources;

import java.io.IOException;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.logging.Logger;

import org.apache.commons.codec.digest.DigestUtils;
import org.locationtech.proj4j.CRSFactory;
import org.locationtech.proj4j.CoordinateTransform;
import org.locationtech.proj4j.CoordinateTransformFactory;
import org.locationtech.proj4j.ProjCoordinate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.cloud.datastore.Datastore;
import com.google.cloud.datastore.DatastoreOptions;
import com.google.cloud.datastore.Entity;
import com.google.cloud.datastore.Key;
import com.google.cloud.datastore.KeyFactory;
import com.google.cloud.datastore.Query;
import com.google.cloud.datastore.QueryResults;
import com.google.cloud.datastore.StructuredQuery;
import com.google.cloud.datastore.StructuredQuery.PropertyFilter;

import auth.AuthTokenUtil;
import auth.JWTToken;
import constants.AccountConstants;
import constants.WorkSheetConstants;
import dto.ListUsersData;
import dto.LoginData;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;
import net.sf.geographiclib.Geodesic;
import net.sf.geographiclib.PolygonArea;
import net.sf.geographiclib.PolygonResult;

@Path("/")
@Produces(MediaType.APPLICATION_JSON + ";charset=utf-8")
public class LoginResource {

    private static final Datastore datastore = DatastoreOptions.getDefaultInstance().getService();

    private static final KeyFactory tokenKeyFactory = datastore.newKeyFactory().setKind("AuthToken");

    private static final Logger LOG = Logger.getLogger(LoginResource.class.getName());
	private static final ObjectMapper mapper = new ObjectMapper();

    @POST
    @Path("/login")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response doLogin(LoginData data) {
        try {
            LOG.info("LoginData recebido: " + (data != null ? data.username : "null") + ", senha: "
                    + (data != null ? data.password : "null"));

            if (data == null || data.username == null || data.password == null) {
                LOG.warning("Dados de login nulos ou incompletos");
                Map<String, String> errorMap = new HashMap<>();
                errorMap.put("message", "Missing username or password.");
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(errorMap)
                        .type(MediaType.APPLICATION_JSON)
                        .build();
            }

            Query<Entity> query = Query.newEntityQueryBuilder()
                    .setKind(AccountConstants.USER)
                    .setFilter(PropertyFilter.eq(AccountConstants.DS_USERNAME, data.username))
                    .build();

            QueryResults<Entity> results = datastore.run(query);

            Entity user = results.next();

            if (user == null) {
                LOG.warning("Usuário não encontrado: " + data.username);
                Map<String, String> errorMap = new HashMap<>();
                errorMap.put("message", "Credenciais inválidas");
                return Response.status(Status.FORBIDDEN)
                        .entity(errorMap)
                        .type(MediaType.APPLICATION_JSON)
                        .build();
            }

            String storedHash = user.contains(AccountConstants.DS_PWD) ? user.getString(AccountConstants.DS_PWD) : null;
            String inputHash = DigestUtils.sha512Hex(data.password);

            if (storedHash == null || !storedHash.equals(inputHash)) {
                LOG.warning("Senha incorreta para: " + data.username);
                Map<String, String> errorMap = new HashMap<>();
                errorMap.put("message", "Credenciais inválidas");
                return Response.status(Status.FORBIDDEN)
                        .entity(errorMap)
                        .type(MediaType.APPLICATION_JSON)
                        .build();
            }

            String role = user.contains(AccountConstants.DS_ROLE) ? user.getString(AccountConstants.DS_ROLE) : null;
            if (role == null) {
                LOG.warning("Role não encontrada para: " + data.username);
                Map<String, String> errorMap = new HashMap<>();
                errorMap.put("message", "Usuário sem role definida");
                return Response.status(Status.FORBIDDEN)
                        .entity(errorMap)
                        .type(MediaType.APPLICATION_JSON)
                        .build();
            }

            String state = user.contains(AccountConstants.DS_STATE) ? user.getString(AccountConstants.DS_STATE) : null;
            if (state.equals(AccountConstants.SLEEP_STATE) || state.equals(AccountConstants.TO_REMOVE_STATE) || state == null) {
                LOG.warning("Conta inativa ou inexistente para: " + data.username);
                Map<String, String> errorMap = new HashMap<>();
                errorMap.put("message", "Conta suspensa ou marcada para remoção");
                return Response.status(Status.FORBIDDEN)
                        .entity(errorMap)
                        .type(MediaType.APPLICATION_JSON)
                        .build();
            }

            Map<String, Object> fields = new HashMap<>();
            fields.put("role", role);
            String email = user.contains(AccountConstants.DS_EMAIL) ? user.getString(AccountConstants.DS_EMAIL) : null;
            String name = user.contains(AccountConstants.DS_FULLNAME) ? user.getString(AccountConstants.DS_FULLNAME)
                    : null;
            String userState = user.contains(AccountConstants.DS_STATE) ? user.getString(AccountConstants.DS_STATE)
                    : null;
            String userProfile = user.contains(AccountConstants.DS_PROFILE)
                    ? user.getString(AccountConstants.DS_PROFILE)
                    : null;

            if (email != null) {
                fields.put("email", email);
            }
            if (name != null) {
                fields.put("name", name);
            }
            if (userState != null) {
                fields.put("state", userState);
            }
            if (userProfile != null) {
                fields.put("profile", userProfile);
            }

            String token = JWTToken.createJWT(data.username, role, fields);
            if (token == null) {
                LOG.severe("Falha ao criar JWT para: " + data.username);
                Map<String, String> errorMap = new HashMap<>();
                errorMap.put("message", "Failed to create JWT.");
                return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                        .entity(errorMap)
                        .type(MediaType.APPLICATION_JSON)
                        .build();
            }

            LOG.info("Login bem-sucedido para: " + data.username);

            // Create user object for response
            Map<String, Object> userResponse = new HashMap<>();
            userResponse.put("username", data.username);
            userResponse.put("role", role);
            if (email != null)
                userResponse.put("email", email);
            if (name != null)
                userResponse.put("name", name);
            if (userState != null)
                userResponse.put("state", userState);
            if (userProfile != null)
                userResponse.put("profile", userProfile);

            Map<String, Object> responseMap = new HashMap<>();
            responseMap.put("token", token);
            responseMap.put("user", userResponse);



            return Response.ok(responseMap, MediaType.APPLICATION_JSON).build();

        } catch (Exception e) {
            LOG.severe("Erro inesperado no login: " + e.getMessage());
            for (StackTraceElement ste : e.getStackTrace()) {
                LOG.severe(ste.toString());
            }
            Map<String, String> errorMap = new HashMap<>();
            errorMap.put("message", "Internal server error: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(errorMap)
                    .type(MediaType.APPLICATION_JSON)
                    .build();
        }
    }

    @GET
    @Path("/auth/me")
    public Response getCurrentUser(@HeaderParam("Authorization") String authHeader) {
        try {
            String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
            Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);
            if (user == null) {
                Map<String, String> errorMap = new HashMap<>();
                errorMap.put("message", "Invalid or expired token");
                return Response.status(Status.UNAUTHORIZED)
                        .entity(errorMap)
                        .build();
            }

            Map<String, Object> userInfo = new HashMap<>();
            userInfo.put("username", user.getKey().getName());

            if (user.contains(AccountConstants.DS_EMAIL)) {
                userInfo.put("email", user.getString(AccountConstants.DS_EMAIL));
            }
            if (user.contains(AccountConstants.DS_FULLNAME)) {
                userInfo.put("name", user.getString(AccountConstants.DS_FULLNAME));
            }
            if (user.contains(AccountConstants.DS_PN)) {
                userInfo.put("pn", user.getString(AccountConstants.DS_PN));
            }
            if (user.contains(AccountConstants.DS_PR)) {
                userInfo.put("pr", user.getString(AccountConstants.DS_PR));
            }
            if (user.contains(AccountConstants.DS_END)) {
                userInfo.put("end", user.getString(AccountConstants.DS_END));
            }
            if (user.contains(AccountConstants.DS_ENDCP)) {
                userInfo.put("endcp", user.getString(AccountConstants.DS_ENDCP));
            }
            if (user.contains(AccountConstants.DS_PHONE1)) {
                userInfo.put("phone1", user.getString(AccountConstants.DS_PHONE1));
            }
            if (user.contains(AccountConstants.DS_PHONE2)) {
                userInfo.put("phone2", user.getString(AccountConstants.DS_PHONE2));
            }
            if (user.contains(AccountConstants.DS_NIF)) {
                userInfo.put("nif", user.getString(AccountConstants.DS_NIF));
            }
            if (user.contains(AccountConstants.DS_CC)) {
                userInfo.put("cc", user.getString(AccountConstants.DS_CC));
            }
            if (user.contains(AccountConstants.DS_CCDE)) {
                userInfo.put("ccde", user.getString(AccountConstants.DS_CCDE));
            }
            if (user.contains(AccountConstants.DS_CCLE)) {
                userInfo.put("ccle", user.getString(AccountConstants.DS_CCLE));
            }
            if (user.contains(AccountConstants.DS_CCV)) {
                userInfo.put("ccv", user.getString(AccountConstants.DS_CCV));
            }
            if (user.contains(AccountConstants.DS_DNASC)) {
                userInfo.put("dnasc", user.getString(AccountConstants.DS_DNASC));
            }
            if (user.contains(AccountConstants.DS_PARTNER)) {
                userInfo.put("partner", user.getString(AccountConstants.DS_PARTNER));
            }
            if (user.contains(AccountConstants.DS_ROLE)) {
                userInfo.put("role", user.getString(AccountConstants.DS_ROLE));
            }
            if (user.contains(AccountConstants.DS_PROFILE)) {
                userInfo.put("profile", user.getString(AccountConstants.DS_PROFILE));
            }
            if (user.contains(AccountConstants.DS_STATE)) {
                userInfo.put("state", user.getString(AccountConstants.DS_STATE));
            }

            return Response.ok(userInfo).build();
        } catch (Exception e) {
            LOG.severe("Error in getCurrentUser: " + e.getMessage());
            Map<String, String> errorMap = new HashMap<>();
            errorMap.put("message", "Internal server error: " + e.getMessage());
            return Response.status(Status.INTERNAL_SERVER_ERROR)
                    .entity(errorMap)
                    .build();
        }
    }

    @POST
    @Path("/auth/logout")
    public Response logout(@HeaderParam("Authorization") String authHeader) {
        String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
        if (token == null) {
            Map<String, String> errorMap = new HashMap<>();
            errorMap.put("message", "No token provided");
            return Response.status(Status.UNAUTHORIZED)
                    .entity(errorMap)
                    .build();
        }

        Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);
        if (user == null) {
            Map<String, String> errorMap = new HashMap<>();
            errorMap.put("message", "Invalid or expired token");
            return Response.status(Status.UNAUTHORIZED)
                    .entity(errorMap)
                    .build();
        }

        LOG.info("Logout successful for user: " + user.getKey().getName());
        Map<String, String> successMap = new HashMap<>();
        successMap.put("message", "Logged out successfully");
        return Response.ok(successMap).build();
    }

    @GET
    @Path("/public/statistics")
    public Response getPublicStatistics() {
        try {
            // Calculate real total area
            double totalArea = calculateTotalArea();
            
            Map<String, Object> stats = new HashMap<>();
            stats.put("terrenos", 150);
            stats.put("area", totalArea);

            return Response.ok(stats).build();
        } catch (Exception e) {
            LOG.severe("Error getting public statistics: " + e.getMessage());
            Map<String, String> errorMap = new HashMap<>();
            errorMap.put("message", "Internal server error: " + e.getMessage());
            return Response.status(Status.INTERNAL_SERVER_ERROR)
                    .entity(errorMap)
                    .build();
        }
    }

    @GET
    @Path("/activities/recent")
    public Response getRecentActivities(@HeaderParam("Authorization") String authHeader) {
        // Mock: lista de atividades
        try {
            var activities = new java.util.ArrayList<java.util.Map<String, Object>>();
            for (int i = 1; i <= 5; i++) {
                var act = new java.util.HashMap<String, Object>();
                act.put("icon", "ri-file-text-line");
                act.put("description", "Atividade de exemplo " + i);
                act.put("timestamp", System.currentTimeMillis() - i * 3600000);
                activities.add(act);
            }
            return Response.ok(activities).build();
        } catch (Exception e) {
            return Response.status(500).entity("Erro ao buscar atividades").build();
        }
    }

    @GET
    @Path("/interventions/recent")
    public Response getRecentInterventions(@HeaderParam("Authorization") String authHeader) {
        // Mock: lista de intervenções
        try {
            var interventions = new java.util.ArrayList<java.util.Map<String, Object>>();
            for (int i = 1; i <= 3; i++) {
                var interv = new java.util.HashMap<String, Object>();
                interv.put("title", "Intervenção Exemplo " + i);
                interv.put("location", "Local " + i);
                interv.put("date", System.currentTimeMillis() - i * 86400000);
                interv.put("status", "completed");
                interventions.add(interv);
            }
            return Response.ok(interventions).build();
        } catch (Exception e) {
            return Response.status(500).entity("Erro ao buscar intervenções").build();
        }
    }

    @GET
    @Path("/statistics/dashboard")
    public Response getDashboardStatistics(@HeaderParam("Authorization") String authHeader) {
        try {
            // Calculate real total area from worksheets and execution sheets
            double totalArea = calculateTotalArea();
            
            var stats = new java.util.HashMap<String, Object>();
            stats.put("terrenos", 1234);
            stats.put("usuarios", 567);
            stats.put("intervencoes", 89);
            stats.put("area", totalArea);
            return Response.ok(stats).build();
        } catch (Exception e) {
            LOG.severe("Error calculating dashboard statistics: " + e.getMessage());
            return Response.status(500).entity("Erro ao buscar estatísticas").build();
        }
    }

    @GET
    @Path("/statistics/area")
    public Response getTotalAreaStatistics() {
        try {
            double totalArea = calculateTotalArea();
            Query<Entity> parcelQuery = Query.newEntityQueryBuilder()
                    .setKind(WorkSheetConstants.WS_PROP)
                    .build();
            QueryResults<Entity> results = datastore.run(parcelQuery);
            Map<String, Object> stats = new HashMap<>();
            stats.put("area", totalArea);
            int count = 0;
            while(results.hasNext()) {
            	results.next();
            	count++;
            }
            stats.put("terrenos",count); // Keep existing mock data for now
            
            return Response.ok(stats).build();
        } catch (Exception e) {
            LOG.severe("Error calculating total area statistics: " + e.getMessage());
            Map<String, String> errorMap = new HashMap<>();
            errorMap.put("message", "Internal server error: " + e.getMessage());
            return Response.status(Status.INTERNAL_SERVER_ERROR)
                    .entity(errorMap)
                    .build();
        }
    }

    private double calculateTotalArea() {
        double totalArea = 0.0;
        
        try {
            // Calculate area from worksheets
            Query<Entity> parcelQuery = Query.newEntityQueryBuilder()
                    .setKind(WorkSheetConstants.WS_PROP)
                    .build();
            QueryResults<Entity> results = datastore.run(parcelQuery);
            
            while(results.hasNext()) {
            	Entity parcel = results.next();
            	String geometry = parcel.getString(WorkSheetConstants.WS_P_GEOMETRY);
            	JsonNode node = safeParse(geometry);
            	
				// transformar coordenadas para wsg84
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
				totalArea+=area;
            }
           
        } catch (Exception e) {
            LOG.severe("Error calculating total area: " + e.getMessage());
        }
        return Math.round(totalArea * 100.0) / 100.0; // Round to 2 decimal places
    }

    private JsonNode safeParse(String json) {
		try {
			return mapper.readTree(json);
		} catch (IOException e) {
			throw new WebApplicationException("Invalid JSON", e, Status.INTERNAL_SERVER_ERROR);
		}
	}
    
    @GET
    @Path("/statistics/admin")
    public Response getAdminStatistics(@HeaderParam("Authorization") String authHeader) {
        try {
            var stats = new java.util.HashMap<String, Object>();
            stats.put("totalUsers", 1234);
            stats.put("activeUsers", 567);
            stats.put("loginsToday", 89);
            return Response.ok(stats).build();
        } catch (Exception e) {
            return Response.status(500).entity("Erro ao buscar estatísticas").build();
        }

    }

    @GET
    @Path("/statistics/userscounter")
    @Produces(MediaType.APPLICATION_JSON)
    public Response getUsersStatistics(@HeaderParam("Authorization") String authHeader) {
        try {
            Query<Entity> query = Query.newEntityQueryBuilder()
                    .setKind(AccountConstants.USER)
                    .build();

            QueryResults<Entity> results = datastore.run(query);

            int total = 0;
            int active = 0;
            int inactive = 0;

            while (results.hasNext()) {
                Entity userEntity = results.next();
                total++;
                String state = userEntity.contains(AccountConstants.DS_STATE)
                        ? userEntity.getString(AccountConstants.DS_STATE)
                        : "";
                if (AccountConstants.ACTIVE_STATE.equals(state)) {
                    active++;
                } else {
                    inactive++;
                }
            }

            Map<String, Object> responseMap = new HashMap<>();
            responseMap.put("total", total);
            responseMap.put("active", active);
            responseMap.put("inactive", inactive);

            return Response.ok(responseMap).build();
        } catch (Exception e) {
            LOG.severe("Error getting user statistics: " + e.getMessage());
            Map<String, String> errorMap = new HashMap<>();
            errorMap.put("message", "Internal server error: " + e.getMessage());
            return Response.status(Status.INTERNAL_SERVER_ERROR)
                    .entity(errorMap)
                    .build();
        }
    }

    @POST
    @Path("/users/list")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response listUsers(@HeaderParam("Authorization") String authHeader, ListUsersData data) {
        try {
            String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
            Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);
            if (user == null) {
                Map<String, String> errorMap = new HashMap<>();
                errorMap.put("message", "Invalid or expired token");
                return Response.status(Status.UNAUTHORIZED)
                        .entity(errorMap)
                        .build();
            }

            String requesterRole = user.getString(AccountConstants.DS_ROLE);

            // Only allow admins to list users
            if (!requesterRole.equals(AccountConstants.SYSTEM_ADMIN_ROLE) &&
                    !requesterRole.equals(AccountConstants.SYSTEM_BACKOFFICE_ROLE)) {
                Map<String, String> errorMap = new HashMap<>();
                errorMap.put("message", "Insufficient permissions");
                return Response.status(Status.FORBIDDEN)
                        .entity(errorMap)
                        .build();
            }

            // Get all users
            Query<Entity> query = Query.newEntityQueryBuilder()
                    .setKind(AccountConstants.USER)
                    .build();

            QueryResults<Entity> results = datastore.run(query);

            var usersList = new java.util.ArrayList<java.util.Map<String, Object>>();

            while (results.hasNext()) {
                Entity userEntity = results.next();
                var userMap = new java.util.HashMap<String, Object>();

                userMap.put("username", userEntity.getKey().getName());

                if (userEntity.contains(AccountConstants.DS_FULLNAME)) {
                    userMap.put("name", userEntity.getString(AccountConstants.DS_FULLNAME));
                }
                if (userEntity.contains(AccountConstants.DS_EMAIL)) {
                    userMap.put("email", userEntity.getString(AccountConstants.DS_EMAIL));
                }
                if (userEntity.contains(AccountConstants.DS_ROLE)) {
                    userMap.put("role", userEntity.getString(AccountConstants.DS_ROLE));
                }
                if (userEntity.contains(AccountConstants.DS_STATE)) {
                    userMap.put("state", userEntity.getString(AccountConstants.DS_STATE));
                }
                if (userEntity.contains(AccountConstants.DS_PROFILE)) {
                    userMap.put("profile", userEntity.getString(AccountConstants.DS_PROFILE));
                }
                if (userEntity.contains(AccountConstants.DS_PHONE1)) {
                    userMap.put("phone1", userEntity.getString(AccountConstants.DS_PHONE1));
                }

                // Add mock last activity for now
                userMap.put("lastActivity",
                        System.currentTimeMillis() - (long) (Math.random() * 7 * 24 * 60 * 60 * 1000));

                usersList.add(userMap);
            }

            return Response.ok(usersList).build();

        } catch (Exception e) {
            LOG.severe("Error listing users: " + e.getMessage());
            Map<String, String> errorMap = new HashMap<>();
            errorMap.put("message", "Internal server error: " + e.getMessage());
            return Response.status(Status.INTERNAL_SERVER_ERROR)
                    .entity(errorMap)
                    .build();
        }
    }

}