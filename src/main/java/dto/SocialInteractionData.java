package dto;

import java.util.List;

public class SocialInteractionData {
    
    // For likes
    public static class LikeData {
        public String username;
        public long timestamp;
        
        public LikeData() {}
        
        public LikeData(String username, long timestamp) {
            this.username = username;
            this.timestamp = timestamp;
        }
    }
    
    // For comments
    public static class CommentData {
        public String id;
        public String username;
        public String comment;
        public long timestamp;
        public List<LikeData> likes;
        
        public CommentData() {}
        
        public CommentData(String id, String username, String comment, long timestamp) {
            this.id = id;
            this.username = username;
            this.comment = comment;
            this.timestamp = timestamp;
        }
    }
    
    // For adding a comment
    public static class AddCommentData {
        public String comment;
        
        public AddCommentData() {}
        
        public AddCommentData(String comment) {
            this.comment = comment;
        }
    }
    
    // For social summary response
    public static class SocialSummaryData {
        public int totalLikes;
        public boolean userLiked;
        public List<CommentData> comments;
        
        public SocialSummaryData() {}
        
        public SocialSummaryData(int totalLikes, boolean userLiked, List<CommentData> comments) {
            this.totalLikes = totalLikes;
            this.userLiked = userLiked;
            this.comments = comments;
        }
    }
}