package dto;

public class ChangeAttributeData {
	
    public String username;
    public String targetUsername;
    public String attributeName;
    public String newValue;

    public ChangeAttributeData() {
    }

    public ChangeAttributeData(String username, String targetUsername, String attributeName, String newValue) {
        this.username = username;
        this.targetUsername = targetUsername;
        this.attributeName = attributeName;
        this.newValue = newValue;
    }
}
