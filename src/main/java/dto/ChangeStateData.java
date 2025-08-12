package dto;

public class ChangeStateData {
	public String targetUsername;
	public String state;

	public ChangeStateData() {

	}

	public ChangeStateData(String targetUsername, String state) {
		this.targetUsername = targetUsername;
		this.state = state;
	}
}
