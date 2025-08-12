package dto;

public class EditOperationData {

    public String operationId;
    public String observations;

    public EditOperationData() {

    }

    public EditOperationData(String operationId, String observations) {
        this.operationId = operationId;
        this.observations = observations;
    }

}