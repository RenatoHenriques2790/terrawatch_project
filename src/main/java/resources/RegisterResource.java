package resources;

import java.util.Map;
import java.util.logging.Logger;

import org.apache.commons.codec.digest.DigestUtils;

import com.google.cloud.datastore.Query;
import com.google.cloud.datastore.QueryResults;
import com.google.cloud.datastore.StructuredQuery.PropertyFilter;
import com.google.cloud.datastore.Datastore;
import com.google.cloud.datastore.DatastoreException;
import com.google.cloud.datastore.DatastoreOptions;
import com.google.cloud.datastore.Entity;
import com.google.cloud.datastore.Key;
import com.google.cloud.datastore.KeyFactory;
import com.google.cloud.datastore.Transaction;

import constants.AccountConstants;
import dto.RegisterData;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;

@Path("/register")
@Produces(MediaType.APPLICATION_JSON + ";charset=utf-8")
public class RegisterResource {

	private static final String MESSAGE_INVALID_REGISTRATION = "Campos do formulário inválidos ou não preenchidos.";
	private static final String MESSAGE_USERNAME_ALREADY_REGISTERED = "Nome de Utilizador já registado";
	private static final String MESSAGE_EMAIL_ALREADY_REGISTERED = "Email já registado.";

	private static final String LOG_MESSAGE_REGISTER_ATTEMPT = "Register attempt by user: ";
	private static final String LOG_MESSAGE_REGISTER_SUCCESSFUL = "Register successful by user: ";

	private static final Logger LOG = Logger.getLogger(RegisterResource.class.getName());
	private static final Datastore datastore = DatastoreOptions.getDefaultInstance().getService();

	KeyFactory userKeyFactory =  datastore.newKeyFactory().setKind(AccountConstants.USER);

	public RegisterResource() {
	}

	@POST
	@Consumes(MediaType.APPLICATION_JSON)
	public Response registerUser(RegisterData data) {
		LOG.fine(LOG_MESSAGE_REGISTER_ATTEMPT + data.username);

		if (!data.validRegistration()) {
			return Response.status(Status.BAD_REQUEST)
					.entity(Map.of("message", MESSAGE_INVALID_REGISTRATION))
					.type(MediaType.APPLICATION_JSON)
					.build();
		}

		Transaction txn = datastore.newTransaction();
		try {
			Key userKey = userKeyFactory.newKey(data.username);

			// Check if email is already registered
			Query<Entity> qEmailCheck = Query.newEntityQueryBuilder()
					.setKind(AccountConstants.USER)
					.setFilter(PropertyFilter.eq(AccountConstants.DS_EMAIL, data.email))
					.build();

			QueryResults<Entity> results = datastore.run(qEmailCheck);

			if (results.hasNext()) {
				txn.rollback();
				return Response.status(Status.CONFLICT)
						.entity(Map.of("message", MESSAGE_EMAIL_ALREADY_REGISTERED))
						.type(MediaType.APPLICATION_JSON)
						.build();
			}
			// Check if username is already registered
			Query<Entity> qUsernameCheck = Query.newEntityQueryBuilder()
					.setKind(AccountConstants.USER)
					.setFilter(PropertyFilter.eq(AccountConstants.DS_USERNAME, data.username))
					.build();

			results = datastore.run(qUsernameCheck);

			if (results.hasNext()) {
				txn.rollback();
				return Response.status(Status.CONFLICT)
						.entity(Map.of("message", MESSAGE_USERNAME_ALREADY_REGISTERED))
						.type(MediaType.APPLICATION_JSON)
						.build();
			}
			// Build the base entity with mandatory fields
			Entity.Builder userBuilder = Entity.newBuilder(userKey)
					.set(AccountConstants.DS_USERNAME, data.username)
					.set(AccountConstants.DS_EMAIL, data.email)
					.set(AccountConstants.DS_PWD, DigestUtils.sha512Hex(data.password))
					.set(AccountConstants.DS_ROLE, data.role)
					.set(AccountConstants.DS_PROFILE, AccountConstants.PUBLIC_PROFILE)
					.set(AccountConstants.DS_STATE, AccountConstants.INACTIVE_STATE);

			// Add name if provided (mandatory for PO)
			if (data.name != null && !data.name.isBlank()) {
				userBuilder.set(AccountConstants.DS_FULLNAME, data.name);
			}

			// Add partner organization if provided (mandatory for PO)
			if (data.partner != null && !data.partner.isBlank()) {
				userBuilder.set(AccountConstants.DS_PARTNER, data.partner);
			}

			// Add phone numbers if provided
			if (data.phone1 != null && !data.phone1.isBlank()) {
				userBuilder.set(AccountConstants.DS_PHONE1, data.phone1);
			}
			if (data.phone2 != null && !data.phone2.isBlank()) {
				userBuilder.set(AccountConstants.DS_PHONE2, data.phone2);
			}

			// Add optional fields if provided
			if (data.pn != null && !data.pn.isBlank()) {
				userBuilder.set(AccountConstants.DS_PN, data.pn);
			}
			if (data.pr != null && !data.pr.isBlank()) {
				userBuilder.set(AccountConstants.DS_PR, data.pr);
			}
			if (data.end != null && !data.end.isBlank()) {
				userBuilder.set(AccountConstants.DS_END, data.end);
			}
			if (data.endcp != null && !data.endcp.isBlank()) {
				userBuilder.set(AccountConstants.DS_ENDCP, data.endcp);
			}
			if (data.nif != null && !data.nif.isBlank()) {
				userBuilder.set(AccountConstants.DS_NIF, data.nif);
			}
			if (data.cc != null && !data.cc.isBlank()) {
				userBuilder.set(AccountConstants.DS_CC, data.cc);
			}
			if (data.ccde != null && !data.ccde.isBlank()) {
				userBuilder.set(AccountConstants.DS_CCDE, data.ccde);
			}
			if (data.ccle != null && !data.ccle.isBlank()) {
				userBuilder.set(AccountConstants.DS_CCLE, data.ccle);
			}
			if (data.ccv != null && !data.ccv.isBlank()) {
				userBuilder.set(AccountConstants.DS_CCV, data.ccv);
			}
			if (data.dnasc != null && !data.dnasc.isBlank()) {
				userBuilder.set(AccountConstants.DS_DNASC, data.dnasc);
			}

			Entity user = userBuilder.build();
			txn.put(user);
			txn.commit();
			LOG.info(LOG_MESSAGE_REGISTER_SUCCESSFUL + data.username);
			return Response.ok(Map.of("message", "User registered successfully"), MediaType.APPLICATION_JSON).build();
		} catch (DatastoreException e) {
			return Response.status(Status.INTERNAL_SERVER_ERROR)
					.entity(Map.of("message", "Internal server error: " + e.getMessage()))
					.type(MediaType.APPLICATION_JSON)
					.build();
		} finally {
			if (txn.isActive()) {
				txn.rollback();
			}
		}
	}
}