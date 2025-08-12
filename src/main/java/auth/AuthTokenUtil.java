package auth;

import java.util.List;
import java.util.logging.Logger;

import com.auth0.jwt.interfaces.DecodedJWT;
import com.google.cloud.datastore.Datastore;
import com.google.cloud.datastore.DatastoreOptions;
import com.google.cloud.datastore.Entity;
import com.google.cloud.datastore.Key;
import com.google.cloud.datastore.KeyFactory;

import constants.AccountConstants;

/**
 * Utility class for JWT authentication and user validation
 */
public class AuthTokenUtil {
    private static final Logger LOG = Logger.getLogger(AuthTokenUtil.class.getName());
    private static final Datastore datastore = DatastoreOptions.getDefaultInstance().getService();
    private static final KeyFactory userKeyFactory = datastore.newKeyFactory().setKind(AccountConstants.USER);

    /**
     * Validates a JWT token and returns the username if valid
     * @param token JWT token string
     * @return username if token is valid, null otherwise
     */
    
    public static String validateTokenAndGetUser(String token) {
        if (token == null || token.trim().isEmpty()) {
            return null;
        }

        try {
            if (!JWTToken.validateJWT(token)) {
                LOG.warning("Invalid JWT token");
                return null;
            }

            DecodedJWT decodedJWT = JWTToken.extractJWT(token);
            if (decodedJWT == null) {
                LOG.warning("Failed to decode JWT token");
                return null;
            }

            return decodedJWT.getSubject();
        } catch (Exception e) {
            LOG.warning("Error validating JWT token: " + e.getMessage());
            return null;
        }
    }

    /**
     * Validates a JWT token and checks if the user exists and has the required role
     * @param token JWT token string
     * @param requiredRole required role for access (can be null to skip role check)
     * @return user entity if valid and authorized, null otherwise
     */
    public static Entity validateTokenAndGetUserEntity(String token, List<String> requiredRole) {
        String username = validateTokenAndGetUser(token);
        if (username == null) {
            return null;
        }

        try {
            Key userKey = userKeyFactory.newKey(username);
            Entity user = datastore.get(userKey);
            
            if (user == null) {
                LOG.warning("User not found in database: " + username);
                return null;
            }

            if (requiredRole != null) {
                String userRole = user.contains("user_role") ? user.getString("user_role") : null;
                if (!requiredRole.contains(userRole)) {
                    LOG.warning("User " + username + " does not have required role: " + requiredRole);
                    return null;
                }
            }

            return user;
        } catch (Exception e) {
            LOG.warning("Error validating user entity: " + e.getMessage());
            return null;
        }
    }

    /**
     * Extracts token from Authorization header
     * @param authHeader Authorization header value
     * @return token string without "Bearer " prefix, null if invalid header
     */
    public static String extractTokenFromHeader(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        return authHeader.substring(7);
    }
} 