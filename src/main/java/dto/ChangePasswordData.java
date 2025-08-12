package dto;

public class ChangePasswordData {
	
	public String username;
	public String targetUsername;
	public String oldPassword;
	public String newPassword;
	public String confirmation;
	
	public ChangePasswordData() {
		
	}
	
	public ChangePasswordData(String username, String targetUsername, String oldPassword, String newPassword, String confirmation) {
		this.username = username;
		this.targetUsername = targetUsername;
		this.oldPassword = oldPassword;
		this.newPassword = newPassword;
		this.confirmation = confirmation;
	}
	
	public boolean isValidRequest() {
		return username.equals(targetUsername) && newPassword.equals(confirmation);
	}

}
