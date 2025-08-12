# TerraWatch - Sistema Integrado de Gestão

## Visão Geral

O TerraWatch é um sistema de gestão territorial avançado que oferece funcionalidades completas de gerenciamento de usuários, visualização de dados geográficos e controle de acesso baseado em funções (RBAC).

## Funcionalidades Principais

### 🔐 Sistema de Autenticação e Autorização
- Autenticação JWT segura
- Sistema de roles hierárquico com 9 níveis de acesso
- Gestão completa de usuários para administradores
- Controle de estados de conta (Ativo, Inativo, Suspenso, Pendente Remoção)

### 👥 Gestão de Usuários
- **Administradores (SYSADMIN/SYSBO)**: Gestão completa de usuários, alteração de roles e estados
- **Gestores (SMBO/SGVBO/SDVBO)**: Acesso específico a folhas de trabalho e relatórios
- **Parceiros (PRBO/PO)**: Gestão de operações e parceiros
- **Proprietários (ADLU)**: Gestão de terrenos próprios
- **Usuários Registados (RU)**: Acesso limitado a dados públicos
- **Visitantes (VU)**: Acesso público ao mapa e estatísticas básicas

### 📊 Dashboard Inteligente
- Dashboard dinâmico baseado no role do usuário
- Navegação lateral responsiva com menus específicos por role
- Estatísticas em tempo real
- Interface moderna e intuitiva

### 🗺️ Sistema de Mapas
- Integração preparada para Google Maps SDK
- Visualização de terrenos e intervenções
- Controles de camadas e filtros
- Acesso diferenciado para usuários públicos e autenticados

### 🛠️ Gestão de Perfil
- Edição completa de informações pessoais
- Alteração de senha segura
- Configurações de privacidade
- Solicitação de remoção de conta

## Arquitetura do Sistema

### Backend (Java JAX-RS)
- **Autenticação**: JWT com validação de roles
- **API REST**: Endpoints para todas as operações CRUD
- **Segurança**: Validação de permissões em todas as operações
- **Persistência**: Google Cloud Datastore

### Frontend (JavaScript/HTML/CSS)
- **SPA**: Single Page Application com navegação dinâmica
- **Responsive**: Design adaptativo para mobile e desktop
- **Modular**: Código organizado em componentes reutilizáveis
- **Interativo**: Interface rica com feedback visual

## Roles e Permissões

| Role | Descrição | Principais Funcionalidades |
|------|-----------|----------------------------|
| **SYSADMIN** | Administrador do Sistema | Gestão completa de usuários, configurações do sistema, logs |
| **SYSBO** | Sistema Back Office | Gestão de usuários (exceto admins), relatórios gerais |
| **SMBO** | Gestor de Folhas Back Office | Criação e edição de folhas de trabalho |
| **SGVBO** | Visualizador Geral Back Office | Visualização geral de folhas |
| **SDVBO** | Visualizador Detalhado Back Office | Visualização detalhada de folhas |
| **PRBO** | Representante Parceiro Back Office | Gestão de parceiros e operadores |
| **PO** | Operador Parceiro | Execução de tarefas e intervenções |
| **ADLU** | Proprietário Aderente | Gestão de terrenos próprios |
| **RU** | Utilizador Registado | Exploração de dados públicos |
| **VU** | Visitante | Acesso público limitado |

## Funcionalidades por Seção

### 📈 Dashboard
- Estatísticas personalizadas por role
- Atividades recentes
- Quick actions baseadas em permissões
- Gráficos e métricas relevantes

### 👤 Gestão de Usuários (Admins)
- Lista paginada com filtros
- Edição de roles e estados
- Visualização de detalhes
- Remoção de contas
- Exportação de dados

### �️ Mapa Interativo
- Visualização de terrenos e intervenções
- Controles de camadas
- Filtros por tipo
- Interface diferenciada para público e autenticados

### 📋 Relatórios
- Relatórios de atividades
- Estatísticas do sistema
- Dados geográficos
- Exportação em múltiplos formatos

### ⚙️ Configurações (Admins)
- Configurações de usuário
- Políticas de senha
- Configurações de email
- Segurança do sistema

## Como Usar

### Para Administradores
1. Faça login com conta administrativa
2. Acesse "Gestão de Usuários" para gerenciar contas
3. Use "Configurações" para ajustar o sistema
4. Monitore atividades através do dashboard

### Para Usuários Finais
1. Registre-se ou faça login
2. Explore o dashboard baseado no seu role
3. Acesse o mapa para visualizar dados geográficos
4. Gerencie seu perfil em "Meu Perfil"

### Para Visitantes
1. Acesse o dashboard público
2. Explore o mapa com dados públicos
3. Visualize estatísticas básicas
4. Registre-se para acesso completo

## Próximas Implementações

- [ ] Integração completa com Google Maps SDK
- [ ] Sistema de notificações em tempo real
- [ ] Módulo de worksheets completo
- [ ] Sistema de mensagens internas
- [ ] API de relatórios avançados
- [ ] Dashboard analytics avançado

## Tecnologias Utilizadas

- **Backend**: Java, JAX-RS, JWT, Google Cloud Datastore
- **Frontend**: HTML5, CSS3, JavaScript ES6+, Remix Icons
- **Autenticação**: JWT com validação de roles
- **Styling**: CSS Custom Properties, Flexbox, Grid
- **Responsividade**: Mobile-first design

## Estrutura de Arquivos

```
src/
├── main/
│   ├── java/
│   │   ├── auth/           # Sistema de autenticação
│   │   ├── constants/      # Constantes do sistema
│   │   ├── dto/           # Data Transfer Objects
│   │   ├── resources/     # Endpoints REST
│   │   └── security/      # Utilitários de segurança
│   └── webapp/
│       ├── features/
│       │   ├── auth/      # Páginas de autenticação
│       │   └── dashboard/ # Dashboard principal
│       └── shared/        # Recursos compartilhados
```

## Contribuindo

1. Clone o repositório
2. Crie uma branch para sua feature
3. Faça commit das mudanças
4. Abra um Pull Request

## Suporte

Para suporte técnico, entre em contato através de:
- Email: suporte@terrawatch.com
- Documentação: [Em desenvolvimento]

---

**TerraWatch v1.0.0** - Sistema Integrado de Gestão Territorial
