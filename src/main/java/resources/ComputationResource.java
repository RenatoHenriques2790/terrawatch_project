package resources;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.logging.Logger;

import org.apache.commons.codec.digest.DigestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.cloud.datastore.Datastore;
import com.google.cloud.datastore.DatastoreException;
import com.google.cloud.datastore.DatastoreOptions;
import com.google.cloud.datastore.Entity;
import com.google.cloud.datastore.Key;
import com.google.cloud.datastore.KeyFactory;
import com.google.cloud.datastore.Query;
import com.google.cloud.datastore.QueryResults;
import com.google.cloud.datastore.StructuredQuery.PropertyFilter;
import com.google.cloud.datastore.Transaction;
import com.google.gson.Gson;

import auth.AuthTokenUtil;
import constants.AccountConstants;
import constants.ExecutionSheetConstants;
import constants.WorkSheetConstants;
import dto.ChangeAttributeData;
import dto.ChangePasswordData;
import dto.ChangeRoleData;
import dto.ChangeStateData;
import dto.RemoveUserData;
import dto.ViewStateData;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;

@Path("/utils")
public class ComputationResource {

	private static final String MESSAGE_NO_SUCH_PROPERTY = "No such property";
	private static final String MESSAGE_INVALID_USER = "Invalid user or target. Please check the usernames inputed.";
	private static final String MESSAGE_INVALID_TOKEN = "Invalid or expired token.";
	private static final String MESSAGE_INVALID_PERMISSION = "Permission denied.";
	private static final String MESSAGE_INVALID_ATTRIBUTE = "You are not allowed to modify the attribute: ";
	private static final String MESSAGE_ACCOUNT_NOT_ACTIVE = "You must have your account activated to perform this action.";
	private static final String MESSAGE_INVALID_NEW_PASSWORD = "The password change attempt is invalid.";
	private static final String MESSAGE_WRONG_PASSWORD = "Wrong password, please try again.";
	private static final String MESSAGE_MISSING_ATTRIBUTE = "O utilizador alvo não tem o campo obrigatório preenchido: ";

	private static final String LOG_MESSAGE_CHANGE_ROLE_ATTEMPT = "Change role attempt by user: ";
	private static final String LOG_MESSAGE_NONEXISTING_USER = "Either the user, or the target dont exist in the data base.";
	private static final String LOG_MESSAGE_USER_WITHOUT_PERMISSION = "Unauthorized change attempt by: ";
	private static final String LOG_MESSAGE_CHANGE_ROLE_SUCCESSFUL = "The role change was successful by: ";
	private static final String LOG_MESSAGE_CHANGE_STATE_ATTEMPT = "Change state attempt by user: ";
	private static final String LOG_MESSAGE_CHANGE_STATE_SUCCESSFUL = "The state change was successful by: ";
	private static final String LOG_MESSAGE_REMOVE_USER_ATTEMPT = "Remove user attempt by user: ";
	private static final String LOG_MESSAGE_CHANGE_ATTRIBUTE_ATTEMPT = "Attribute change attempted by user: ";
	private static final String LOG_MESSAGE_CHANGE_ATTRIBUTE_SUCCESSFUL = "The attribute change attempt was successful by: ";
	private static final String LOG_MESSAGE_CHANGE_PASSWORD_SUCCESSFUL = "Password changed successfuly for: ";
	private static final String LOG_MESSAGE_CHANGE_PASSWORD_INVALID = "Password change request invalid by: ";
	private static final String LOG_MESSAGE_WRONG_PASSWORD = "Wrong password in password change attempt by: ";
	private static final String LOG_MESSAGE_VIEW_ROLE_ATTEMPT = "View state attempt by user: ";

	private static final Logger LOG = Logger.getLogger(ComputationResource.class.getName());
	private static final Datastore datastore = DatastoreOptions.getDefaultInstance().getService();
	private static final KeyFactory userKeyFactory = datastore.newKeyFactory().setKind(AccountConstants.USER);

	private final Gson g = new Gson();
	private final ObjectMapper mapper = new ObjectMapper();

	private static final String[] allAttributes = {
			AccountConstants.DS_PARTNER,
			AccountConstants.DS_PN,
			AccountConstants.DS_PR,
			AccountConstants.DS_END,
			AccountConstants.DS_ENDCP,
			AccountConstants.DS_PHONE1,
			AccountConstants.DS_PHONE2,
			AccountConstants.DS_NIF,
			AccountConstants.DS_CC,
			AccountConstants.DS_CCDE,
			AccountConstants.DS_CCLE,
			AccountConstants.DS_CCV,
			AccountConstants.DS_DNASC,
	};

	private static final String[] allAttributesADLU = {
			AccountConstants.DS_PN,
			AccountConstants.DS_PR,
			AccountConstants.DS_END,
			AccountConstants.DS_ENDCP,
			AccountConstants.DS_PHONE1,
			AccountConstants.DS_NIF,
			AccountConstants.DS_CC,
			AccountConstants.DS_CCDE,
			AccountConstants.DS_CCLE,
			AccountConstants.DS_CCV,
			AccountConstants.DS_DNASC,
	};

	private static final String[] allAttributesPO = {
			AccountConstants.DS_PARTNER,
			AccountConstants.DS_PHONE1
	};

	private static final String[] allAttributesRU = {
			AccountConstants.DS_PN,
			AccountConstants.DS_PR,
			AccountConstants.DS_END,
			AccountConstants.DS_ENDCP,
			AccountConstants.DS_PHONE1,
	};

	public ComputationResource() {

	}

	@POST
	@Path("/activateaccount")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response activateAccount(@HeaderParam("Authorization") String authHeader, ChangeStateData data) {

		List<String> activateAccountRoles = new ArrayList<>();
		activateAccountRoles.add(AccountConstants.SYSTEM_ADMIN_ROLE);
		activateAccountRoles.add(AccountConstants.SYSTEM_BACKOFFICE_ROLE);

		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, activateAccountRoles);
		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}

		Transaction txn = datastore.newTransaction();

		try {
			Query<Entity> query = Query.newEntityQueryBuilder()
					.setKind(AccountConstants.USER)
					.setFilter(PropertyFilter.eq(AccountConstants.DS_USERNAME, data.targetUsername))
					.build();

			QueryResults<Entity> results = datastore.run(query);

			Entity targetUser = results.next();
			String targetRole = targetUser.getString(AccountConstants.DS_ROLE);

			if (targetRole.equals(AccountConstants.SYSTEM_ADMIN_ROLE) ||
					targetRole.equals(AccountConstants.SYSTEM_BACKOFFICE_ROLE) ||
					targetRole.equals(AccountConstants.SHEET_MANAGER_BACKOFFICE) ||
					targetRole.equals(AccountConstants.SHEET_GENERAL_VIEWER_BACKOFFICE) ||
					targetRole.equals(AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE) ||
					targetRole.equals(AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE)) {

				for (String attribute : allAttributes) {
					if (targetUser.getString(attribute) == null || targetUser.getString(attribute).isEmpty()) {
						LOG.warning(LOG_MESSAGE_NONEXISTING_USER + data.targetUsername);
						txn.rollback();
						return Response.status(Status.FORBIDDEN).entity(MESSAGE_MISSING_ATTRIBUTE + attribute).build();
					}
				}
			}

			else if (targetRole.equals(AccountConstants.ADHERENT_LANDOWNER_USER)) {
				for (String attribute : allAttributesADLU) {
					if (targetUser.getString(attribute) == null || targetUser.getString(attribute).isEmpty()) {
						LOG.warning(LOG_MESSAGE_NONEXISTING_USER + data.targetUsername);
						txn.rollback();
						return Response.status(Status.FORBIDDEN).entity(MESSAGE_MISSING_ATTRIBUTE + attribute).build();
					}
				}
			}

			else if (targetRole.equals(AccountConstants.PARTNER_OPERATOR)) {
				for (String attribute : allAttributesPO) {
					if (targetUser.getString(attribute) == null || targetUser.getString(attribute).isEmpty()) {
						LOG.warning(LOG_MESSAGE_NONEXISTING_USER + data.targetUsername);
						txn.rollback();
						return Response.status(Status.FORBIDDEN).entity(MESSAGE_MISSING_ATTRIBUTE + attribute).build();
					}
				}
			}

			else if (targetRole.equals(AccountConstants.REGISTERED_USER)) {
				for (String attribute : allAttributesRU) {
					if (targetUser.getString(attribute) == null || targetUser.getString(attribute).isEmpty()) {
						LOG.warning(LOG_MESSAGE_NONEXISTING_USER + data.targetUsername);
						txn.rollback();
						return Response.status(Status.FORBIDDEN).entity(MESSAGE_MISSING_ATTRIBUTE + attribute).build();
					}
				}
			}

			targetUser = Entity.newBuilder(targetUser)
					.set(AccountConstants.DS_STATE, AccountConstants.ACTIVE_STATE)
					.build();
			txn.put(targetUser);
			txn.commit();

			return Response.ok(g.toJson(true)).build();
		}

		catch (DatastoreException e) {
			LOG.severe("Datastore error: " + e.getMessage());
			txn.rollback();
			if(e.getMessage().contains(MESSAGE_NO_SUCH_PROPERTY)) {
				String attribute = e.getMessage().split(" ")[3];
				return Response.status(Status.FORBIDDEN).entity(MESSAGE_MISSING_ATTRIBUTE + attribute).build();
			}
			return Response.status(Status.INTERNAL_SERVER_ERROR).entity("Internal server error").build();
		}

		finally {
			if (txn.isActive()) {
				txn.rollback();
			}
		}

	}

	@POST
	@Path("/changerole")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response changeUserRole(@HeaderParam("Authorization") String authHeader, ChangeRoleData data) {
		LOG.fine(LOG_MESSAGE_CHANGE_ROLE_ATTEMPT + data.username);

		List<String> changeRoleRoles = new ArrayList<>();
		changeRoleRoles.add(AccountConstants.SYSTEM_ADMIN_ROLE);
		changeRoleRoles.add(AccountConstants.SYSTEM_BACKOFFICE_ROLE);

		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, changeRoleRoles);

		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}

		Key userTargetKey = userKeyFactory.newKey(data.targetUsername);
		Entity targetUser = datastore.get(userTargetKey);
		if (targetUser == null) {
			LOG.warning(LOG_MESSAGE_NONEXISTING_USER + data.username);
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
		}

		String requesterRole = user.getString(AccountConstants.DS_ROLE);
		String targetRole = targetUser.getString(AccountConstants.DS_ROLE);
		String newRole = data.role;

		boolean allowed = false;
		if (isModifiable(newRole)) {
			switch (requesterRole) {
				case AccountConstants.SYSTEM_ADMIN_ROLE:
					allowed = true;
					break;
				case AccountConstants.SYSTEM_BACKOFFICE_ROLE:
					if (!targetRole.equals(AccountConstants.SYSTEM_ADMIN_ROLE) &&
							!targetRole.equals(AccountConstants.SYSTEM_BACKOFFICE_ROLE) &&
							!newRole.equals(AccountConstants.SYSTEM_ADMIN_ROLE) &&
							!newRole.equals(AccountConstants.SYSTEM_BACKOFFICE_ROLE)) {
						allowed = true;
					}
					break;
				default:
					allowed = false;
			}
		}

		if (!allowed) {
			LOG.warning(LOG_MESSAGE_USER_WITHOUT_PERMISSION + data.username);
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_PERMISSION).build();
		}

		Entity updatedTarget = Entity.newBuilder(targetUser).set(AccountConstants.DS_ROLE, newRole).build();
		datastore.put(updatedTarget);

		LOG.info(LOG_MESSAGE_CHANGE_ROLE_SUCCESSFUL + data.username);
		return Response.ok(g.toJson(true)).build();
	}

	private boolean isModifiable(String role) {
		return !role.equals(AccountConstants.ADHERENT_LANDOWNER_USER) &&
				!role.equals(AccountConstants.REGISTERED_USER) &&
				!role.equals(AccountConstants.VIEWER_USER);
	}

	@POST
	@Path("/changestate")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response changeUserState(@HeaderParam("Authorization") String authHeader, ChangeStateData data) {
		LOG.fine(LOG_MESSAGE_CHANGE_STATE_ATTEMPT);

		List<String> changeStateRoles = new ArrayList<>();
		changeStateRoles.add(AccountConstants.SYSTEM_ADMIN_ROLE);
		changeStateRoles.add(AccountConstants.SYSTEM_BACKOFFICE_ROLE);

		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, changeStateRoles);
		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}

		String username = user.getString(AccountConstants.DS_USERNAME);

		Key userTargetKey = userKeyFactory.newKey(data.targetUsername);
		Entity targetUser = datastore.get(userTargetKey);
		if (targetUser == null) {
			LOG.warning(LOG_MESSAGE_NONEXISTING_USER + data.targetUsername);
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
		}

		String requesterRole = user.getString(AccountConstants.DS_ROLE);
		String targetRole = targetUser.getString(AccountConstants.DS_ROLE);
		String newState = data.state;

		boolean allowed = false;
		if (isStateValid(targetRole, newState)) {
			switch (requesterRole) {
				case AccountConstants.SYSTEM_ADMIN_ROLE:
					allowed = true;
					break;
				case AccountConstants.SYSTEM_BACKOFFICE_ROLE:
					if (!targetRole.equals(AccountConstants.SYSTEM_ADMIN_ROLE)) {
						allowed = true;
					}
					break;
				default:
					allowed = false;
			}
		}

		if (!allowed) {
			LOG.warning(LOG_MESSAGE_USER_WITHOUT_PERMISSION + username);
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_PERMISSION).build();
		}

		Entity updatedTarget = Entity.newBuilder(targetUser).set(AccountConstants.DS_STATE, newState).build();
		datastore.put(updatedTarget);

		LOG.info(LOG_MESSAGE_CHANGE_STATE_SUCCESSFUL + data.targetUsername);
		return Response.ok(g.toJson(true)).build();
	}

	private boolean isStateValid(String targetRole, String newState) {
		return (newState.equals(AccountConstants.ACTIVE_STATE)
				|| newState.equals(AccountConstants.INACTIVE_STATE) || newState.equals(AccountConstants.SLEEP_STATE)
				|| newState.equals(AccountConstants.TO_REMOVE_STATE));
	}

	@POST
	@Path("/removeaccount")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response removeUserAccount(@HeaderParam("Authorization") String authHeader, RemoveUserData data) {
		LOG.fine(LOG_MESSAGE_REMOVE_USER_ATTEMPT + data.username);

		List<String> removeAccountRoles = new ArrayList<>();
		removeAccountRoles.add(AccountConstants.SYSTEM_ADMIN_ROLE);
		removeAccountRoles.add(AccountConstants.SYSTEM_BACKOFFICE_ROLE);

		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, removeAccountRoles);
		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}

		Key targetKey = userKeyFactory.newKey(data.targetUsername);
		Entity target = datastore.get(targetKey);
		if (target == null) {
			LOG.warning(LOG_MESSAGE_NONEXISTING_USER + data.username);
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
		}

		String requesterRole = user.getString(AccountConstants.DS_ROLE);
		String targetRole = target.getString(AccountConstants.DS_ROLE);

		boolean allowed = false;
		switch (requesterRole) {
			case AccountConstants.SYSTEM_ADMIN_ROLE:
				allowed = true;
				break;
			case AccountConstants.SYSTEM_BACKOFFICE_ROLE:
				if (!targetRole.equals(AccountConstants.SYSTEM_ADMIN_ROLE)) {
					allowed = true;
				}
				break;
			default:
				allowed = false;
		}

		if (!allowed) {
			LOG.warning(LOG_MESSAGE_USER_WITHOUT_PERMISSION + data.username);
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_PERMISSION).build();
		}

		datastore.delete(targetKey);
		return Response.ok(g.toJson(true)).build();
	}

	@POST
	@Path("/changeattribute")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response changeAccountAttributes(@HeaderParam("Authorization") String authHeader, ChangeAttributeData data) {
		LOG.info(LOG_MESSAGE_CHANGE_ATTRIBUTE_ATTEMPT + data.username);

		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null || data.username == null || data.targetUsername == null) {
				LOG.warning(MESSAGE_INVALID_USER);
				return Response.status(Status.UNAUTHORIZED)
						.entity(MESSAGE_INVALID_USER)
						.build();
			}

			// Check if user is modifying their own attributes
			boolean isSelfModification = data.username.equals(data.targetUsername);
			String userRole = user.getString(AccountConstants.DS_ROLE);

			// Allow users to modify their own attributes
			if (isSelfModification) {
				// These attributes can be modified by any user on themselves
				String[] selfModifiableAttributes = {
						AccountConstants.DS_FULLNAME, AccountConstants.DS_PHONE1, AccountConstants.DS_PHONE2,
						AccountConstants.DS_END, AccountConstants.DS_ENDCP, AccountConstants.DS_NIF, AccountConstants.DS_CC,
						AccountConstants.DS_PN, AccountConstants.DS_PR, AccountConstants.DS_CCDE, AccountConstants.DS_CCLE,
						AccountConstants.DS_CCV, AccountConstants.DS_DNASC
				};

				if (Arrays.asList(selfModifiableAttributes).contains(data.attributeName)) {
					Entity targetUser = user; // Same as user for self-modification

					Entity updatedUser = Entity.newBuilder(targetUser)
							.set(data.attributeName, data.newValue)
							.build();

					datastore.update(updatedUser);

					LOG.info(LOG_MESSAGE_CHANGE_ATTRIBUTE_SUCCESSFUL + data.username);
					return Response.ok(true).build();
				}
			}

			// For non-self modification or special attributes, check role permissions
			if (!isAttributeModifiable(data.attributeName) && !userRole.equals(AccountConstants.SYSTEM_ADMIN_ROLE)) {
				LOG.warning(MESSAGE_INVALID_ATTRIBUTE + data.attributeName);
				return Response.status(Status.FORBIDDEN)
						.entity(MESSAGE_INVALID_ATTRIBUTE + data.attributeName)
						.build();
			}

			Key userKey = userKeyFactory.newKey(data.targetUsername);
			Entity targetUser = datastore.get(userKey);

			if (targetUser == null) {
				LOG.warning(LOG_MESSAGE_NONEXISTING_USER);
				return Response.status(Status.NOT_FOUND)
						.entity(MESSAGE_INVALID_USER)
						.build();
			}

			Entity updatedUser = Entity.newBuilder(targetUser)
					.set(data.attributeName, data.newValue)
					.build();

			datastore.update(updatedUser);

			LOG.info(LOG_MESSAGE_CHANGE_ATTRIBUTE_SUCCESSFUL + data.username);
			return Response.ok(true).build();

		} catch (Exception e) {
			LOG.severe("Error in changeAccountAttributes: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR)
					.entity("Error: " + e.getMessage())
					.build();
		}
	}

	private boolean isAttributeModifiable(String attribute) {
		return attribute.equals(AccountConstants.DS_FULLNAME) || attribute.equals(AccountConstants.DS_PHONE1)
				|| attribute.equals(AccountConstants.DS_PROFILE)
				|| attribute.equals(AccountConstants.DS_END) || attribute.equals(AccountConstants.DS_CC)
				|| attribute.equals(AccountConstants.DS_NIF);
	}

	@POST
	@Path("/changepassword")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response changePassword(@HeaderParam("Authorization") String authHeader, ChangePasswordData data) {

		List<String> changePasswordRoles = new ArrayList<>();
		changePasswordRoles.add(AccountConstants.SYSTEM_ADMIN_ROLE);
		changePasswordRoles.add(AccountConstants.SYSTEM_BACKOFFICE_ROLE);
		changePasswordRoles.add(AccountConstants.SHEET_MANAGER_BACKOFFICE);
		changePasswordRoles.add(AccountConstants.SHEET_GENERAL_VIEWER_BACKOFFICE);
		changePasswordRoles.add(AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE);
		changePasswordRoles.add(AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE);
		changePasswordRoles.add(AccountConstants.PARTNER_OPERATOR);
		changePasswordRoles.add(AccountConstants.ADHERENT_LANDOWNER_USER);
		changePasswordRoles.add(AccountConstants.REGISTERED_USER);

		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, changePasswordRoles);
		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}

		if (data.newPassword == null || data.newPassword.length() < 8) {
			LOG.warning(LOG_MESSAGE_CHANGE_PASSWORD_INVALID + data.username);
			return Response.status(Status.BAD_REQUEST).entity(MESSAGE_INVALID_NEW_PASSWORD).build();
		}

		String hashedOldPassword = DigestUtils.sha512Hex(data.oldPassword);
		String currentPassword = user.getString(AccountConstants.DS_PWD);

		if (!hashedOldPassword.equals(currentPassword)) {
			LOG.warning(LOG_MESSAGE_WRONG_PASSWORD + data.username);
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_WRONG_PASSWORD).build();
		}

		String hashedNewPassword = DigestUtils.sha512Hex(data.newPassword);
		Entity updatedUser = Entity.newBuilder(user).set(AccountConstants.DS_PWD, hashedNewPassword).build();
		datastore.put(updatedUser);

		LOG.info(LOG_MESSAGE_CHANGE_PASSWORD_SUCCESSFUL + data.username);
		return Response.ok(g.toJson(true)).build();
	}

	@POST
	@Path("/requestAccountRemoval")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response requestAccountRemoval(@HeaderParam("Authorization") String authHeader) {

		List<String> changePasswordRoles = new ArrayList<>();
		changePasswordRoles.add(AccountConstants.SYSTEM_ADMIN_ROLE);
		changePasswordRoles.add(AccountConstants.SYSTEM_BACKOFFICE_ROLE);
		changePasswordRoles.add(AccountConstants.SHEET_MANAGER_BACKOFFICE);
		changePasswordRoles.add(AccountConstants.SHEET_GENERAL_VIEWER_BACKOFFICE);
		changePasswordRoles.add(AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE);
		changePasswordRoles.add(AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE);
		changePasswordRoles.add(AccountConstants.PARTNER_OPERATOR);
		changePasswordRoles.add(AccountConstants.ADHERENT_LANDOWNER_USER);
		changePasswordRoles.add(AccountConstants.REGISTERED_USER);

		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, changePasswordRoles);
		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}

		Entity updatedUser = Entity.newBuilder(user)
				.set(AccountConstants.DS_STATE, AccountConstants.TO_REMOVE_STATE)
				.build();
		datastore.put(updatedUser);

		return Response.ok(g.toJson(true)).build();
	}

	@POST
	@Path("/changeprivacy")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response changePrivacy(@HeaderParam("Authorization") String authHeader) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				LOG.warning(MESSAGE_INVALID_USER);
				return Response.status(Status.UNAUTHORIZED)
						.entity(MESSAGE_INVALID_USER)
						.build();
			}

			String currentPrivacy = user.contains(AccountConstants.DS_PROFILE) ? user.getString(AccountConstants.DS_PROFILE)
					: AccountConstants.PUBLIC_PROFILE;
			String newPrivacy = currentPrivacy.equals(AccountConstants.PUBLIC_PROFILE) ? AccountConstants.PRIVATE_PROFILE
					: AccountConstants.PUBLIC_PROFILE;

			Entity updatedUser = Entity.newBuilder(user)
					.set(AccountConstants.DS_PROFILE, newPrivacy)
					.build();

			datastore.update(updatedUser);

			return Response.ok(true).build();

		} catch (Exception e) {
			LOG.severe("Error in changePrivacy: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR)
					.entity("Error: " + e.getMessage())
					.build();
		}
	}

	@POST
	@Path("/viewState")
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response viewState(@HeaderParam("Authorization") String authHeader, ViewStateData data) {
		LOG.fine(LOG_MESSAGE_VIEW_ROLE_ATTEMPT + data.username);

		List<String> viewStateRoles = new ArrayList<>();
		viewStateRoles.add(AccountConstants.SYSTEM_ADMIN_ROLE);
		viewStateRoles.add(AccountConstants.SYSTEM_BACKOFFICE_ROLE);
		viewStateRoles.add(AccountConstants.SHEET_MANAGER_BACKOFFICE);
		viewStateRoles.add(AccountConstants.SHEET_GENERAL_VIEWER_BACKOFFICE);
		viewStateRoles.add(AccountConstants.SHEET_DETAILED_VIEWER_BACKOFFICE);
		viewStateRoles.add(AccountConstants.PARTNER_REPRESENTATIVE_BACKOFFICE);
		viewStateRoles.add(AccountConstants.PARTNER_OPERATOR);
		viewStateRoles.add(AccountConstants.ADHERENT_LANDOWNER_USER);
		viewStateRoles.add(AccountConstants.REGISTERED_USER);

		String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
		Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, viewStateRoles);
		if (user == null) {
			return Response.status(Status.UNAUTHORIZED).entity(MESSAGE_INVALID_TOKEN).build();
		}

		Key targetKey = userKeyFactory.newKey(data.targetUsername);
		Entity target = datastore.get(targetKey);
		if (target == null) {
			LOG.warning(LOG_MESSAGE_NONEXISTING_USER + data.username);
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_USER).build();
		}

		String requesterRole = user.getString(AccountConstants.DS_ROLE);
		String targetRole = target.getString(AccountConstants.DS_ROLE);
		String targetState = target.getString(AccountConstants.DS_STATE);

		boolean allowed = false;
		switch (requesterRole) {
			case AccountConstants.SYSTEM_ADMIN_ROLE:
				allowed = true;
				break;
			case AccountConstants.SYSTEM_BACKOFFICE_ROLE:
				if (!targetRole.equals(AccountConstants.SYSTEM_ADMIN_ROLE)) {
					allowed = true;
				}
				break;
			default:
				allowed = false;
		}

		if (!allowed) {
			LOG.warning(LOG_MESSAGE_USER_WITHOUT_PERMISSION + data.username);
			return Response.status(Status.FORBIDDEN).entity(MESSAGE_INVALID_PERMISSION).build();
		}

		return Response.ok(g.toJson(targetState)).build();
	}

	@GET
	@Path("/inactiveUser")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getInactiveUsers() {
		Query<Entity> query = Query.newEntityQueryBuilder()
				.setKind(AccountConstants.USER)
				.setFilter(PropertyFilter.eq(AccountConstants.DS_STATE, AccountConstants.INACTIVE_STATE))
				.build();
		QueryResults<Entity> results = datastore.run(query);
		List<String> users = new ArrayList<>();
		Entity user;
		while (results.hasNext()) {
			user = results.next();
			users.add(user.getString(AccountConstants.DS_USERNAME));
		}
		return Response.ok(g.toJson(users)).build();
	}

	@GET
	@Path("/search")
	@Produces(MediaType.APPLICATION_JSON)
	public Response globalSearch(@HeaderParam("Authorization") String authHeader,
			@jakarta.ws.rs.QueryParam("q") String query,
			@jakarta.ws.rs.QueryParam("type") String type,
			@jakarta.ws.rs.QueryParam("limit") Integer limitParam) {
		try {
			String token = AuthTokenUtil.extractTokenFromHeader(authHeader);
			Entity user = AuthTokenUtil.validateTokenAndGetUserEntity(token, null);

			if (user == null) {
				return Response.status(Status.FORBIDDEN).entity("Invalid or expired token").build();
			}

			if (query == null || query.trim().isEmpty()) {
				return Response.status(Status.BAD_REQUEST).entity("Search query is required").build();
			}

			String searchQuery = query.trim().toLowerCase();
			int limit = (limitParam != null && limitParam > 0) ? limitParam : 20;
			String userRole = user.getString(AccountConstants.DS_ROLE);

			ObjectNode result = mapper.createObjectNode();
			ArrayNode usersArray = result.putArray("users");
			ArrayNode worksheetsArray = result.putArray("worksheets");
			ArrayNode executionSheetsArray = result.putArray("executionSheets");
			ArrayNode activitiesArray = result.putArray("activities");
			ArrayNode postsArray = result.putArray("posts");

			// Search users (only if user has permission to view users)
			if ((type == null || "users".equals(type)) && 
				(AccountConstants.SYSTEM_ADMIN_ROLE.equals(userRole) || 
				 AccountConstants.SYSTEM_BACKOFFICE_ROLE.equals(userRole))) {
				
				Query<Entity> usersQuery = Query.newEntityQueryBuilder()
						.setKind(AccountConstants.USER)
						.build();
				QueryResults<Entity> usersResults = datastore.run(usersQuery);

				while (usersResults.hasNext() && usersArray.size() < limit) {
					Entity userEntity = usersResults.next();
					String username = userEntity.getString(AccountConstants.DS_USERNAME);
					String name = userEntity.contains(AccountConstants.DS_FULLNAME) ? 
						userEntity.getString(AccountConstants.DS_FULLNAME) : username;
					String email = userEntity.contains(AccountConstants.DS_EMAIL) ? 
						userEntity.getString(AccountConstants.DS_EMAIL) : "";
					String role = userEntity.getString(AccountConstants.DS_ROLE);

					if (username.toLowerCase().contains(searchQuery) || 
						name.toLowerCase().contains(searchQuery) || 
						email.toLowerCase().contains(searchQuery) ||
						role.toLowerCase().contains(searchQuery)) {
						
						ObjectNode userNode = mapper.createObjectNode();
						userNode.put("id", username);
						userNode.put("name", name);
						userNode.put("username", username);
						userNode.put("email", email);
						userNode.put("role", role);
						userNode.put("type", "user");
						userNode.put("displayName", name + " (" + username + ")");
						usersArray.add(userNode);
					}
				}
			}

			// Search worksheets
			if (type == null || "worksheets".equals(type)) {
				Query<Entity> worksheetsQuery = Query.newEntityQueryBuilder()
						.setKind(WorkSheetConstants.WORKSHEET)
						.build();
				QueryResults<Entity> worksheetsResults = datastore.run(worksheetsQuery);

				while (worksheetsResults.hasNext() && worksheetsArray.size() < limit) {
					Entity worksheet = worksheetsResults.next();
					Long worksheetId = worksheet.getKey().getId();
					String worksheetName = "Worksheet " + worksheetId;
					
					// Check if worksheet contains search query in any field
					boolean matches = false;
					for (String propertyName : worksheet.getNames()) {
						Object value = worksheet.getValue(propertyName);
						if (value != null && value.toString().toLowerCase().contains(searchQuery)) {
							matches = true;
							break;
						}
					}

					if (matches || worksheetName.toLowerCase().contains(searchQuery)) {
						ObjectNode worksheetNode = mapper.createObjectNode();
						worksheetNode.put("id", worksheetId);
						worksheetNode.put("name", worksheetName);
						worksheetNode.put("type", "worksheet");
						worksheetNode.put("displayName", worksheetName);
						worksheetsArray.add(worksheetNode);
					}
				}
			}

			// Search execution sheets
			if (type == null || "executionSheets".equals(type)) {
				Query<Entity> execSheetsQuery = Query.newEntityQueryBuilder()
						.setKind(ExecutionSheetConstants.EXEC_SHEET)
						.build();
				QueryResults<Entity> execSheetsResults = datastore.run(execSheetsQuery);

				while (execSheetsResults.hasNext() && executionSheetsArray.size() < limit) {
					Entity execSheet = execSheetsResults.next();
					String execSheetId = execSheet.getKey().getName();
					String execSheetName = "Execution Sheet " + execSheetId.replace("execution_", "");
					
					// Check if execution sheet contains search query in any field
					boolean matches = false;
					for (String propertyName : execSheet.getNames()) {
						Object value = execSheet.getValue(propertyName);
						if (value != null && value.toString().toLowerCase().contains(searchQuery)) {
							matches = true;
							break;
						}
					}

					if (matches || execSheetName.toLowerCase().contains(searchQuery)) {
						ObjectNode execSheetNode = mapper.createObjectNode();
						execSheetNode.put("id", execSheetId);
						execSheetNode.put("name", execSheetName);
						execSheetNode.put("type", "executionSheet");
						execSheetNode.put("displayName", execSheetName);
						executionSheetsArray.add(execSheetNode);
					}
				}
			}

			// Search activities (photos and videos)
			if (type == null || "activities".equals(type)) {
				// Search photos
				Query<Entity> photosQuery = Query.newEntityQueryBuilder()
						.setKind("ExecutionSheetPhoto")
						.build();
				QueryResults<Entity> photosResults = datastore.run(photosQuery);

				while (photosResults.hasNext() && activitiesArray.size() < limit) {
					Entity photo = photosResults.next();
					String photoId = photo.getKey().getName();
					String description = photo.contains("description") ? 
						photo.getString("description") : "Photo";
					String executionSheetId = photo.contains("executionSheetId") ? 
						photo.getString("executionSheetId") : "";
					
					if (description.toLowerCase().contains(searchQuery) || 
						executionSheetId.toLowerCase().contains(searchQuery)) {
						
						ObjectNode activityNode = mapper.createObjectNode();
						activityNode.put("id", photoId);
						activityNode.put("name", description);
						activityNode.put("type", "activity");
						activityNode.put("activityType", "photo");
						activityNode.put("executionSheetId", executionSheetId);
						activityNode.put("displayName", "Photo: " + description);
						activitiesArray.add(activityNode);
					}
				}

				// Search videos
				Query<Entity> videosQuery = Query.newEntityQueryBuilder()
						.setKind("ExecutionSheetVideo")
						.build();
				QueryResults<Entity> videosResults = datastore.run(videosQuery);

				while (videosResults.hasNext() && activitiesArray.size() < limit) {
					Entity video = videosResults.next();
					String videoId = video.getKey().getName();
					String description = video.contains("description") ? 
						video.getString("description") : "Video";
					String executionSheetId = video.contains("executionSheetId") ? 
						video.getString("executionSheetId") : "";
					
					if (description.toLowerCase().contains(searchQuery) || 
						executionSheetId.toLowerCase().contains(searchQuery)) {
						
						ObjectNode activityNode = mapper.createObjectNode();
						activityNode.put("id", videoId);
						activityNode.put("name", description);
						activityNode.put("type", "activity");
						activityNode.put("activityType", "video");
						activityNode.put("executionSheetId", executionSheetId);
						activityNode.put("displayName", "Video: " + description);
						activitiesArray.add(activityNode);
					}
				}
			}

			// Search posts (social feed)
			if (type == null || "posts".equals(type)) {
				// Search text posts
				Query<Entity> textPostsQuery = Query.newEntityQueryBuilder()
						.setKind("SocialPost")
						.build();
				QueryResults<Entity> textPostsResults = datastore.run(textPostsQuery);

				while (textPostsResults.hasNext() && postsArray.size() < limit) {
					Entity post = textPostsResults.next();
					String postId = post.getKey().getName();
					String content = post.contains("content") ? 
						post.getString("content") : "";
					String postType = post.contains("type") ? 
						post.getString("type") : "text";
					String executionSheetId = post.contains("executionSheetId") ? 
						post.getString("executionSheetId") : "";
					
					if (content.toLowerCase().contains(searchQuery) || 
						postType.toLowerCase().contains(searchQuery) ||
						executionSheetId.toLowerCase().contains(searchQuery)) {
						
						ObjectNode postNode = mapper.createObjectNode();
						postNode.put("id", postId);
						postNode.put("name", content.length() > 50 ? content.substring(0, 50) + "..." : content);
						postNode.put("type", "post");
						postNode.put("postType", postType);
						postNode.put("executionSheetId", executionSheetId);
						postNode.put("displayName", postType + " post: " + 
							(content.length() > 30 ? content.substring(0, 30) + "..." : content));
						postsArray.add(postNode);
					}
				}
			}

			return Response.ok(mapper.writeValueAsString(result)).build();

		} catch (Exception e) {
			LOG.severe("Error in global search: " + e.getMessage());
			return Response.status(Status.INTERNAL_SERVER_ERROR)
					.entity("Error performing search: " + e.getMessage())
					.build();
		}
	}

}