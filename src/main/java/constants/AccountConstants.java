package constants;

public final class AccountConstants {

    // Roles
    // System Management Accounts
    public static final String SYSTEM_ADMIN_ROLE = "SYSADMIN";
    public static final String SYSTEM_BACKOFFICE_ROLE = "SYSBO";
    // Roles Operacionais Organizacionais
    public static final String SHEET_MANAGER_BACKOFFICE = "SMBO";
    public static final String SHEET_GENERAL_VIEWER_BACKOFFICE = "SGVBO";
    public static final String SHEET_DETAILED_VIEWER_BACKOFFICE = "SDVBO";
    public static final String PARTNER_REPRESENTATIVE_BACKOFFICE = "PRBO";
    public static final String PARTNER_OPERATOR = "PO";
    public static final String ADHERENT_LANDOWNER_USER = "ADLU";
    // External use Accounts
    public static final String REGISTERED_USER = "RU";
    // No account
    public static final String VIEWER_USER = "VU";

    // Profile
    public static final String PUBLIC_PROFILE = "PUBLICO";
    public static final String PRIVATE_PROFILE = "PRIVADO";

    // State
    public static final String INACTIVE_STATE = "DESATIVADO";
    public static final String ACTIVE_STATE = "ATIVADO";
    public static final String SLEEP_STATE = "SUSPENSO";
    public static final String TO_REMOVE_STATE = "P-REMOVER";

    // Datastore Property names
    // Attributes
    public static final String DS_USERID = "user_userId";
    public static final String DS_USERNAME = "user_username";
    public static final String DS_EMAIL = "user_email";
    public static final String DS_PWD = "user_pwd";
    public static final String DS_FULLNAME = "user_name";
    public static final String DS_PN = "user_pn";
    public static final String DS_PR = "user_pr";
    public static final String DS_END = "user_end";
    public static final String DS_ENDCP = "user_endcp";
    public static final String DS_PHONE1 = "user_phone1";
    public static final String DS_PHONE2 = "user_phone2";
    public static final String DS_NIF = "user_nif";
    public static final String DS_CC = "user_cc";
    public static final String DS_CCDE = "user_ccde";
    public static final String DS_CCLE = "user_ccle";
    public static final String DS_CCV = "user_ccv";
    public static final String DS_DNASC = "user_dnasc";
    public static final String DS_PARTNER = "user_partner";
    // Role
    public static final String DS_ROLE = "user_role";
    // Invisible Attributes
    public static final String DS_PROFILE = "user_profile";
    public static final String DS_STATE = "user_state";
    // Keystores
    public static final String USER = "User";

    private AccountConstants() {
    }
}

