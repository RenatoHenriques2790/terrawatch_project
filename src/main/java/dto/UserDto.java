package dto;

public class UserDto {

    public String userId;
    public String username;
    public String email;
    public String pwd; // Password
    public String name; // Nome da pessoa
    public String pn; // Pais de Nacionalidade
    public String pr; // Pais de Residencia
    public String end; // Morada (Rua Francisco Costa 23, 2. DTO)
    public String endcp; // Codigo Postal da morada (2829519 Caparica)
    public String phone1; // +351 217982630
    public String phone2; // +351 912345678
    public String nif; // Numero Fiscal de Contribuinte
    public String cc; // Cartao de Cidadao (9456723)
    public String ccde; // Data de emissao do CC
    public String ccle; // Local de Emissao do CC
    public String ccv; // Validade do CC
    public String dnasc; // Data de Nascimento

    public String role; // Values in AccountConstants

    public String profile; // PUBLICO, PRIVADO
    public String state; // ATIVO, INATIVO, SUSPENSO, P-REMOVER

    public UserDto() {
    }
}