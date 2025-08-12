package listeners;

import java.util.logging.Logger;

import org.apache.commons.codec.digest.DigestUtils;

import com.google.cloud.datastore.Datastore;
import com.google.cloud.datastore.DatastoreOptions;
import com.google.cloud.datastore.Entity;
import com.google.cloud.datastore.Key;
import com.google.cloud.datastore.KeyFactory;
import com.google.cloud.datastore.Transaction;

import constants.AccountConstants;
import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;
import jakarta.servlet.annotation.WebListener;
import resources.RegisterResource;

@WebListener
public class AppStartupListener implements ServletContextListener {

	private static final String ROOT_USERNAME = "root";
	private static final String ROOT_EMAIL = "root@example.com";
	private static final String ROOT_PWD = "default_password";
	private static final String ROOT_NAME = "root";
	private static final String ROOT_BIRTH_COUNTRY = "root";
	private static final String ROOT_RESIDENCE_COUNTRY = "root";
	private static final String ROOT_ADDRESS = "root";
	private static final String ROOT_POSTAL_CODE = "root";
	private static final String ROOT_PHONE1 = "000000000";
	private static final String ROOT_PHONE2 = "000000000";
	private static final String ROOT_NIF = "root";
	private static final String ROOT_CC = "root";
	private static final String ROOT_CCDE = "root";
	private static final String ROOT_CCLE = "root";
	private static final String ROOT_CCV = "root";
	private static final String ROOT_DNASC = "root";
	private static final String ROOT_PRIVACY = AccountConstants.PRIVATE_PROFILE;
	private static final String ROOT_ROLE = AccountConstants.SYSTEM_ADMIN_ROLE;
	private static final String ROOT_ACCOUNT_STATE = AccountConstants.ACTIVE_STATE;

	private static final Logger LOG = Logger.getLogger(RegisterResource.class.getName());

	@Override
	public void contextInitialized(ServletContextEvent sce) {
		createRoot(ROOT_USERNAME, ROOT_EMAIL, ROOT_PWD, ROOT_NAME, ROOT_BIRTH_COUNTRY, ROOT_RESIDENCE_COUNTRY,
				ROOT_ADDRESS,
				ROOT_POSTAL_CODE, ROOT_PHONE1, ROOT_PHONE2, ROOT_NIF, ROOT_CC, ROOT_CCDE, ROOT_CCLE, ROOT_CCV,
				ROOT_DNASC, ROOT_ROLE, ROOT_PRIVACY, ROOT_ACCOUNT_STATE);
	}

	@Override
	public void contextDestroyed(ServletContextEvent sce) {
		// No cleanup needed
	}

	private void createRoot(String username, String email, String pwd, String name, String pn, String pr, String end,
			String endcp, String phone1, String phone2, String nif, String cc, String ccde, String ccle, String ccv,
			String dnasc, String role, String profile, String state) {

		Datastore datastore = DatastoreOptions.getDefaultInstance().getService();
		
		KeyFactory keyFactory = datastore.newKeyFactory().setKind(AccountConstants.USER);
		Key rootKey = keyFactory.newKey("root");

		Transaction txn = datastore.newTransaction();

		Entity root = txn.get(rootKey);

		if (root != null) {
			txn.rollback();
			LOG.info("Root already exists!");
		} else {
			Entity newUser = txn.get(rootKey);
			try {
				newUser = Entity.newBuilder(rootKey)
						.set(AccountConstants.DS_USERNAME, username)
						.set(AccountConstants.DS_EMAIL, email)
						.set(AccountConstants.DS_PWD, DigestUtils.sha512Hex(pwd))
						.set(AccountConstants.DS_FULLNAME, name)
						.set(AccountConstants.DS_PN, pn)
						.set(AccountConstants.DS_PR, pr)
						.set(AccountConstants.DS_END, end)
						.set(AccountConstants.DS_ENDCP, endcp)
						.set(AccountConstants.DS_PHONE1, phone1)
						.set(AccountConstants.DS_PHONE2, phone2)
						.set(AccountConstants.DS_NIF, nif)
						.set(AccountConstants.DS_CC, cc)
						.set(AccountConstants.DS_CCDE, ccde)
						.set(AccountConstants.DS_CCLE, ccle)
						.set(AccountConstants.DS_CCV, ccv)
						.set(AccountConstants.DS_DNASC, dnasc)
						.set(AccountConstants.DS_ROLE, role)
						.set(AccountConstants.DS_PROFILE, profile)
						.set(AccountConstants.DS_STATE, state)
						.build();
				txn.put(newUser);
				txn.commit();
				LOG.info("New user created: " + username);
			} catch (Exception e) {
				LOG.severe("Error creating user: " + e.getMessage());
			} finally {
				if (txn.isActive()) {
					txn.rollback();
				}
			}
		}
	}

}