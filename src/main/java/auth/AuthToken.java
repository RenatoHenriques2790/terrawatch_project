package auth;

import java.util.Date;
import java.util.UUID;

import com.google.cloud.Timestamp;

public class AuthToken {

    public static final long EXPIRATION_TIME = 1000 * 60 * 60 * 2; // 2 hours in ms

    public String username;    
    public String tokenID;     
    public Timestamp validFrom;     
    public Timestamp validTo;       
    public String role;           

    public AuthToken() {
    }

    public AuthToken(String username, String role) {
        this.username = username;
        this.role = role;
        this.tokenID = UUID.randomUUID().toString();
        this.validFrom = Timestamp.now();
        long expirationMillis = this.validFrom.toDate().getTime() + EXPIRATION_TIME;
        this.validTo = Timestamp.of(new Date(expirationMillis));
    }
}
