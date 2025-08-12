package dto;

public class RegisterData {

	// Mandatory fields for all account types
	public String email;
	public String username;
	public String password;
	public String confirmation;
	public String role;  // RU, ADLU, PO

	// Mandatory fields for PO
	public String name;  // Required only for PO
	public String partner;  // Required only for PO
	public String phone1;  // Required only for PO

	// Optional fields (common for all types)
	public String pn;     // País de Nacionalidade
	public String pr;     // País de Residência
	public String end;    // Morada
	public String endcp;  // Código Postal
	public String phone2; // Telefone Secundário
	public String nif;    // NIF
	public String cc;     // Cartão de Cidadão
	public String ccde;   // Data de Emissão do CC
	public String ccle;   // Local de Emissão do CC
	public String ccv;    // Validade do CC
	public String dnasc;  // Data de Nascimento

	public RegisterData() {
	}

	private boolean nonEmptyOrBlankField(String field) {
		return field != null && !field.isBlank();
	}

	public boolean validRegistration() {
		// Basic validation for all account types
		if (!nonEmptyOrBlankField(username) || !nonEmptyOrBlankField(password) || 
			!nonEmptyOrBlankField(email) || !nonEmptyOrBlankField(role) || 
			!nonEmptyOrBlankField(confirmation) || !password.equals(confirmation) || 
			!email.contains("@")) {
			return false;
		}

		// Additional validation for PO account type
		if ("PO".equals(role)) {
			return nonEmptyOrBlankField(name) && 
				   nonEmptyOrBlankField(partner) && 
				   nonEmptyOrBlankField(phone1);
		}

		return true;
	}
}
