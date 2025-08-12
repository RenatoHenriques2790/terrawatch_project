package dto;
import java.util.List;

public class AddActivityInfoData {
	
	public String activityId;
    public String observations;
    public String gpsPath;
    public List<String> photoUrls;

    public AddActivityInfoData() {		
	}
	
	public AddActivityInfoData(String activityId, String observations, String gpsPath, List<String> photoUrls) {
		this.activityId = activityId;
        this.observations = observations;
        this.gpsPath = gpsPath;
        this.photoUrls = photoUrls;
	}
	 
}