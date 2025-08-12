package constants;

public final class ExecutionSheetConstants {

    // Keystore
    public static final String EXEC_SHEET       		= "ExecutionSheet";
    public static final String EXEC_OPERATION    		= "ExecutionOperation";
    public static final String EXEC_PARCEL      		= "ExecutionParcel";
    public static final String EXEC_ACTIVITY    		= "ExecutionActivity";

    // ExecutionSheet 
    public static final String ES_WORKSHEET_ID          = "worksheetId";
    public static final String ES_START_DATETIME        = "startDateTime";
    public static final String ES_LAST_ACTIVITY_DATETIME= "lastActivityDateTime";
    public static final String ES_END_DATETIME          = "endDateTime";
    public static final String ES_OBSERVATIONS          = "observations";

    // ExecutionOperation 
    public static final String EO_EXECUTIONSHEET_ID		= "executionId";
    public static final String EO_OPERATION_CODE        = "operationCode";
    public static final String EO_START_DATETIME        = "startDateTime";
    public static final String EO_LAST_ACTIVITY_DATETIME= "lastActivityDateTime";
    public static final String EO_TOTAL_AREA_HA         = "totalAreaHa";
    public static final String EO_TOTAL_AREA_PERCENT    = "totalAreaPercent";
    public static final String EO_END_DATETIME          = "endDateTime";
    public static final String EO_OBSERVATIONS          = "observations";

    // ParcelOperationData 
    public static final String EP_OPERATION_ID  		= "operationId";
    public static final String EP_POLYGON_ID            = "polygonId";
    public static final String EP_STATUS                = "status";
    public static final String EP_START_DATETIME        = "startDateTime";
    public static final String EP_LAST_ACTIVITY_DATETIME= "lastActivityDateTime";
    public static final String EP_END_DATETIME          = "endDateTime";
    public static final String EP_OPERATORS 			= "operators";
    public static final String EP_OBSERVATIONS			= "observations";
    public static final String EP_GPS_PATH              = "gpsPath";
    
    //Status
    public static final String EP_STATUS_PA 			= "POR_ATRIBUIR";
    public static final String EP_STATUS_A 				= "ATRIBUIDO";
    public static final String EP_STATUS_EE 			= "EM_EXECUCAO";
    public static final String EP_STATUS_E 				= "EXECUTADO";

    // ActivityData
    public static final String EA_PARCEL_ID         	= "parcelId";
    public static final String EA_ACTIVITY_ID			= "activityId";
    public static final String EA_OPERATOR_ID			= "operatorUsername";
    public static final String EA_START_DATETIME        = "startDateTime";
    public static final String EA_END_DATETIME          = "endDateTime";
    public static final String EA_OBSERVATIONS          = "observations";
    public static final String EA_GPS_PATH              = "gpsPath";
    public static final String EA_PHOTO_URLS            = "photoUrls";

    private ExecutionSheetConstants() {}
}