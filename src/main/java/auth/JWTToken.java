package auth;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTCreator;
import com.auth0.jwt.JWTVerifier;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.DecodedJWT;

public class JWTToken {

    public static String createJWT(String username, String role, Map<String, Object> extraClaims) {
        Algorithm alg = JWTConfig.getJWTAlgorithm();
        long nowMillis = System.currentTimeMillis();
        Date now = new Date(nowMillis);
        Date exp = new Date(nowMillis + JWTConfig.EXPIRATION_TIME);

        Map<String, Object> header = new HashMap<>();
        header.put("typ", "ADC-JWT-Type");
        header.put("alg", alg.getName());
        header.put("ref", "session-token");

        JWTCreator.Builder builder = JWT.create()
            .withHeader(header)
            .withIssuer(JWTConfig.ISSUER)
            .withJWTId(UUID.randomUUID().toString())
            .withSubject(username)
            .withClaim("role", role)
            .withIssuedAt(now)
            .withNotBefore(now)
            .withExpiresAt(exp);

        if (extraClaims != null) {
            extraClaims.forEach((k, v) -> {
                if (v != null) {
                    builder.withClaim(k, v.toString());
                }
            });
        }

        return builder.sign(alg);
    }

    public static boolean validateJWT(String token) {
        try {
            Algorithm alg = JWTConfig.getJWTAlgorithm();
            JWTVerifier verifier = JWT.require(alg)
                .withIssuer(JWTConfig.ISSUER)
                .build();
            DecodedJWT jwt = verifier.verify(token);
            Date now = new Date();
            return !jwt.getNotBefore().after(now) && !jwt.getExpiresAt().before(now);
        } catch (JWTVerificationException e) {
            System.err.println("JWT inválido: " + e.getMessage());
            return false;
        }
    }

    public static DecodedJWT extractJWT(String token) {
        try {
            Algorithm alg = JWTConfig.getJWTAlgorithm();
            JWTVerifier verifier = JWT.require(alg)
                .withIssuer(JWTConfig.ISSUER)
                .build();
            return verifier.verify(token);
        } catch (JWTVerificationException e) {
            return null;
        }
    }
}
