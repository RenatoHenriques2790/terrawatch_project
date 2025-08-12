package dto;

public class UpdateAdjudicationData {

	public String username;
	public String reference;
	public String adjudicationState;
	public String adjudicationDate;
	public String startDate;
	public String endDate;
	public String partnerAccount;
	public String adjudicationEntity;
	public String companyNIF;
	public String workState;
	public String observations;

	public UpdateAdjudicationData() {
	}

	public UpdateAdjudicationData(String username, String reference, String adjudicationState, String adjudicationDate,
			String startDate, String endDate, String partnerAccount, String adjudicationEntity, String companyNIF,
			String workState, String observations) {
		this.username = username;
		this.reference = reference;
		if (adjudicationState.equals("ADJUDICADO")) {
			this.adjudicationDate = adjudicationDate;
			this.startDate = startDate;
			this.endDate = endDate;
			this.partnerAccount = partnerAccount;
			this.adjudicationEntity = adjudicationEntity;
			this.companyNIF = companyNIF;
			this.workState = workState;
			this.observations = observations;
		}
	}

	public boolean isValidAdjudicationFields() {
		return workState.equals("NÃO INICIADO") || workState.equals("EM CURSO") || workState.equals("CONCLUÍDO");
	}
}
