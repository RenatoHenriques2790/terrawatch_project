package dto;

import java.util.List;

public class PhotoUploadData {
    
    // For photo metadata
    public static class PhotoData {
        public String id;
        public String url;
        public String thumbnailUrl;
        public String description;
        public String uploadedBy;
        public long uploadTimestamp;
        public String activityId;
        public String location; // GPS coordinates
        public int likes;
        public boolean userLiked;
        
        public PhotoData() {}
        
        public PhotoData(String id, String url, String uploadedBy, long uploadTimestamp) {
            this.id = id;
            this.url = url;
            this.uploadedBy = uploadedBy;
            this.uploadTimestamp = uploadTimestamp;
        }
    }
    
    // For photo upload response
    public static class PhotoUploadResponse {
        public boolean success;
        public String photoId;
        public String url;
        public String thumbnailUrl;
        public String message;
        
        public PhotoUploadResponse() {}
        
        public PhotoUploadResponse(boolean success, String photoId, String url, String message) {
            this.success = success;
            this.photoId = photoId;
            this.url = url;
            this.message = message;
        }
    }
    
    // For activity photo gallery
    public static class ActivityPhotoGallery {
        public String activityId;
        public List<PhotoData> photos;
        public int totalPhotos;
        
        public ActivityPhotoGallery() {}
        
        public ActivityPhotoGallery(String activityId, List<PhotoData> photos) {
            this.activityId = activityId;
            this.photos = photos;
            this.totalPhotos = photos != null ? photos.size() : 0;
        }
    }
}