package dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;

@JsonIgnoreProperties(ignoreUnknown = true)
public class WorkSheetData {
    public String type;
    public Crs crs;
    public Metadata metadata;
    public List<Feature> features;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Crs {
        public String type;
        public CrsProperties properties;

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class CrsProperties {
            public String name;

            public CrsProperties() {
            }

            public CrsProperties(String name) {
                this.name = name;
            }
        }

        public Crs() {
        }

        public Crs(String type, CrsProperties properties) {
            this.type = type;
            this.properties = properties;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Metadata {
        public long id;
        public String starting_date;
        public String finishing_date;
        public String issue_date;
        public String award_date;
        public int issuing_user_id;
        public long service_provider_id;
        public String posa_code;
        public String posa_description;
        public String posp_code;
        public String posp_description;
        public List<String> aigp;
        public List<Operation> operations;

        public Metadata() {
        }

        public Metadata(long id, String starting_date, String finishing_date, String issue_date, String award_date,
                int issuing_user_id, long service_provider_id, String posa_code, String posa_description,
                String posp_code, String posp_description, List<String> aigp, List<Operation> operations) {
            this.id = id;
            this.starting_date = starting_date;
            this.finishing_date = finishing_date;
            this.issue_date = issue_date;
            this.award_date = award_date;
            this.issuing_user_id = issuing_user_id;
            this.service_provider_id = service_provider_id;
            this.posa_code = posa_code;
            this.posa_description = posa_description;
            this.posp_code = posp_description;
            this.aigp = aigp;
            this.operations = operations;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Operation {
        public String operation_code;
        public String operation_description;
        public double area_ha;

        public Operation() {
        }

        public Operation(String operation_code, String operation_description, double area_ha) {
            this.operation_code = operation_code;
            this.operation_description = operation_description;
            this.area_ha = area_ha;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Feature {
        public String type;
        public Properties properties;
        public JsonNode geometry;

        public Feature() {
        }

        public Feature(String type, Properties properties, JsonNode geometry) {
            this.type = type;
            this.properties = properties;
            this.geometry = geometry;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Properties {
        public String aigp;
        public String rural_property_id;
        public long polygon_id;
        public long UI_id;

        public Properties() {
        }

        public Properties(String aigp, String rural_property_id, long polygon_id, long UI_id) {
            this.aigp = aigp;
            this.rural_property_id = rural_property_id;
            this.polygon_id = polygon_id;
            this.UI_id = UI_id;
        }
    }

    public WorkSheetData() {
    }

    public WorkSheetData(String type, Crs crs, Metadata metadata, List<Feature> features) {
        this.type = type;
        this.crs = crs;
        this.metadata = metadata;
        this.features = features;
    }

}