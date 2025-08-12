package dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

public class LoginData {
	
	@JsonProperty("username")
	public String username;
	
	@JsonProperty("password")
	public String password;
	
	public LoginData() {
		// Default constructor for JSON deserialization
	}
	
	@JsonCreator
	public LoginData(
		@JsonProperty("username") String username,
		@JsonProperty("password") String password
	) {
		this.username = username;
		this.password = password;
	}
}
