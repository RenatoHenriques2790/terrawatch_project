package dto;

public class ChangeRoleData {

	public String username;
	public String targetUsername;
	public String role;

	public ChangeRoleData() {

	}

	public ChangeRoleData(String username, String targetUsername, String role) {
		this.username = username;
		this.targetUsername = targetUsername;
		this.role = role;
	}

}
