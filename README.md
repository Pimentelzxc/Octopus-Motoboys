# Octopus Motoboy Control

Sistema web mobile-first para controlar disponibilidade, fila, entregas e pagamentos de motoboys em tempo real. O frontend usa React + Vite, a autenticação/banco/realtime usam Supabase e a aplicação está preparada como PWA e para deploy na Vercel.

## O que foi implementado

- Cadastro público exclusivo para motoboys e login com sessão persistente.
- Redirecionamento por função: `motoboy`, `kitchen` ou `admin`.
- Áreas de cozinha e administração estritamente separadas no frontend e nas funções protegidas do banco.
- Status `offline`, `available` e `on_delivery`, tempo de espera e heartbeat de atividade.
- Painel da cozinha em tempo real, fila ordenada por `available_since` crescente, chamada simples com Web Push, atalho separado do WhatsApp com mensagem pronta e resumo diário sem dados financeiros.
- Registro manual ou por despacho, correção/cancelamento lógico em até 10 minutos e histórico diário.
- Número de pedido obrigatório, preservando zeros à esquerda, com prevenção de duplicidade por data operacional.
- Precificação oficial no PostgreSQL, inclusive tratamento de valores pendentes acima de 13 km.
- Relatórios administrativos por período e faixa de KM, ranking e exportações CSV detalhada/resumida.
- Fechamentos financeiros sem duplicidade, snapshot dos totais, marcação de pagamento e histórico do motoboy.
- Auditoria de alterações de KM/valor, cancelamentos, fechamentos e pagamentos.
- Painel administrativo com busca, filtros, edição, ativação/desativação, mudança de função e exclusão segura.
- Segurança no banco com RLS, privilégios por coluna e RPCs administrativas verificando o admin no servidor.
- PWA com manifest, service worker e atualização automática.
- Web Push no iPhone e Android para avisar o motoboy quando a cozinha o chamar.
- Tratamento de loading, falhas, perda de conexão e retorno da rede.

## Arquitetura da disponibilidade

A disponibilidade fica em uma tabela própria (`availability`) com relação 1:1 ao perfil. Isso mantém os dados de presença, que mudam com frequência, separados dos dados cadastrais; deixa a fila e os eventos de Realtime mais simples e evita transmitir atualizações do perfil inteiro a cada mudança de status.

Os estados operacionais são:

- `offline`: fora da fila.
- `available`: na fila, ordenado por `available_since ASC`.
- `on_delivery`: chamado pela cozinha e removido da fila.

Ao finalizar uma chamada da cozinha, nenhum pedido é criado: o motoboy volta automaticamente a ficar disponível, `available_since` recebe o horário atual e ele entra no fim da fila.

## Entregas e precificação

O motoboy pode registrar uma entrega manualmente ou finalizar uma corrida iniciada pela cozinha. Número do pedido e KM passam por uma tela de conferência antes do envio; data, horário, origem e usuário são preenchidos pelo servidor. O frontend calcula apenas uma prévia; a trigger `secure_delivery_pricing` chama `calculate_delivery_price(distance_km)` e grava o valor oficial.

### Número do pedido

`deliveries.order_number` é `TEXT NOT NULL`, portanto `001` nunca vira `1`. A normalização remove espaços externos/internos e converte letras para maiúsculas sem remover zeros. A combinação `order_number + operational_date` é única para entregas não canceladas: o mesmo número pode reaparecer em outro dia, mas não pode ser registrado duas vezes no mesmo dia.

A cozinha apenas chama o motoboy, sem cadastrar ou reservar pedidos. Ao finalizar a corrida, ele volta diretamente ao fim da fila, sem formulário e sem gerar entrega. Quando quiser registrar um pedido realizado, o motoboy usa separadamente o botão **Registrar entrega** na tela inicial; esses registros manuais nascem diretamente como `completed`.

| Distância                   |                   Valor |
| ---------------------------- | ----------------------: |
| Até 4,00 km                 |                 R$ 6,00 |
| Acima de 4,00 até 5,00 km   |                 R$ 7,00 |
| Acima de 5,00 até 6,00 km   |                 R$ 8,00 |
| Acima de 6,00 até 7,00 km   |                 R$ 9,50 |
| Acima de 7,00 até 8,00 km   |                R$ 11,00 |
| Acima de 8,00 até 10,00 km  |                R$ 15,00 |
| Acima de 10,00 até 12,00 km |                R$ 17,00 |
| Acima de 12,00 até 13,00 km |                R$ 19,00 |
| Acima de 13,00 km            | Pendente de aprovação |

Quilometragem e dinheiro usam `NUMERIC`, nunca ponto flutuante. Entregas acima de 13 km ficam com `pricing_status = 'pending'` e valores nulos até o ajuste de um administrador.

## Fechamentos e prevenção de duplicidade

`deliveries.payment_closing_id` liga cada entrega a, no máximo, um fechamento. A função `create_payment_closing` bloqueia o motoboy durante a transação, considera somente entregas abertas e impede fechar períodos com valores pendentes. Totais, quantidade e quilometragem são gravados em `payment_closings` como snapshot. Depois do vínculo, a entrega não pode ser corrigida ou cancelada.

## 1. Instalação local

Requisitos: Node.js 22+ e npm.

```bash
npm install
copy .env.example .env
```

No macOS/Linux, use `cp .env.example .env`.

## 2. Criar e configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com/).
2. Abra **SQL Editor**, crie uma consulta e execute todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql). O arquivo é idempotente e também atualiza uma instalação anterior sem apagar perfis ou disponibilidades.
3. Em **Project Settings > API Keys**, copie a URL do projeto e a chave pública `Publishable` (`sb_publishable_...`).
4. Preencha o `.env`:

```env
VITE_SUPABASE_URL=https://SEU-ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
VITE_WEB_PUSH_VAPID_PUBLIC_KEY=SUA_CHAVE_PUBLICA_VAPID
```

Nunca use uma chave `sb_secret_...` ou `service_role` no frontend. Elas ignoram RLS e pertencem exclusivamente a ambientes seguros de servidor.

Se o banco já estava rodando com uma versão anterior do sistema, aplique as migrações pendentes de [`supabase/migrations`](supabase/migrations) na ordem do nome dos arquivos. Em uma instalação nova, use apenas o `schema.sql`, que já contém todas as evoluções.

### Autenticação

Em **Authentication > URL Configuration**:

- Site URL local: `http://localhost:5173`
- Redirect URLs: adicione `http://localhost:5173/**` e, depois do deploy, `https://seu-dominio.vercel.app/**`.

Em **Authentication > General Configuration**, desative **Allow new users to sign up**. Assim, o endpoint público de cadastro fica bloqueado e somente a Edge Function administrativa pode criar usuários.

### RLS e Realtime

O `schema.sql` habilita RLS, cria todas as policies e adiciona `profiles`, `availability`, `deliveries`, `payment_closings` e `delivery_activity` à publication `supabase_realtime`. `delivery_activity` é um canal sem dados financeiros usado para atualizar os totais da cozinha. Confirme em **Database > Publications** que essas tabelas aparecem em `supabase_realtime`.

Motoboys não têm permissão SQL direta para definir valores: registro, correção e exclusão em até 10 minutos passam por RPCs restritas. A cozinha recebe somente os campos operacionais através de `get_kitchen_queue`, sem valores financeiros. Funções administrativas verificam `is_admin()` no banco. As ações financeiras relevantes geram registros em `audit_logs`.

Cada conta possui uma única função. A conta `kitchen` acessa somente `/cozinha` e as RPCs de fila/despacho; a conta `admin` acessa somente `/admin`. Uma tentativa de abrir a rota da outra função é redirecionada, e o banco repete a verificação independentemente do frontend.

### Notificações Web Push

Gere uma vez o par de chaves VAPID:

```bash
npm run generate:vapid
```

- Cadastre a chave pública como `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` no `.env` local e nas variáveis da Vercel.
- No Supabase, abra **Edge Functions > Secrets** e cadastre `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` e `WEB_PUSH_VAPID_SUBJECT` (por exemplo, `mailto:seu-email@dominio.com`).
- Publique `supabase/functions/swift-function/index.ts` como uma Edge Function chamada `swift-function`.
- Publique `supabase/functions/admin-create-user/index.ts` como uma segunda Edge Function chamada `admin-create-user`. Ela usa a chave de serviço somente no servidor e confirma que o solicitante é administrador.
- A chave privada nunca deve receber o prefixo `VITE_` nem ser cadastrada na Vercel.

No Android, instale o PWA e toque em **Ativar notificações** na área do motoboy. No iPhone com iOS 16.4 ou mais recente, primeiro use **Compartilhar > Adicionar à Tela de Início**, abra a Octopus pelo ícone instalado e então ative as notificações. O sistema solicita permissão somente após esse toque.

## 3. Criar o primeiro administrador

1. Antes de bloquear cadastros públicos, crie a primeira conta em **Authentication > Users > Add user** no Dashboard do Supabase.
2. No SQL Editor do Supabase, complete os dados e promova somente essa conta, usando o e-mail correto:

```sql
update public.profiles
set role = 'admin',
    full_name = 'Administrador',
    username = 'administrador',
    phone = '(00) 00000-0000'
where email = 'seu-email@exemplo.com';
```

Saia e entre novamente. Publique a função `admin-create-user` e desative **Allow new users to sign up**. A partir daí, todos os usuários são cadastrados exclusivamente pelo painel `/admin`.

## 4. Executar e validar

```bash
npm run dev
```

Build de produção:

```bash
npm run build
npm run preview
```

Teste reproduzível de todos os limites da tabela de preço:

```bash
npm run test:pricing
```

Depois de aplicar o schema, execute `supabase/pricing_tests.sql` no SQL Editor para validar a função oficial do PostgreSQL com os mesmos 16 casos de borda.
O teste também confirma que `001` continua sendo `001` depois da normalização.

Execute também `supabase/security_tests.sql` para confirmar que fila e despacho exigem o perfil `kitchen` e que a auditoria continua exclusiva do administrador.

Para testar o Realtime, abra uma sessão de motoboy no celular/janela anônima e a cozinha em outra sessão. Ao alternar o status, o card deve entrar ou sair da fila sem recarregar a página.

## 5. Publicar na Vercel

1. Envie o projeto para um repositório Git e importe-o na Vercel.
2. A Vercel detectará Vite. O comando de build é `npm run build` e a pasta de saída é `dist`.
3. Em **Project Settings > Environment Variables**, cadastre `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` para Production (e Preview, se desejar).
4. Faça um novo deploy após cadastrar as variáveis.
5. Adicione o domínio final às Redirect URLs do Supabase.

O `vercel.json` já redireciona rotas como `/cozinha` e `/admin` para o SPA, evitando 404 ao atualizar a página.

## Estrutura principal

```text
src/
  components/   componentes de layout, formulários, modal e proteção
  config/       nome, logo e textos centrais da marca
  contexts/     autenticação e notificações
  hooks/        relógio e estado de conexão
  lib/          cliente Supabase
  pages/        login, motoboy, cozinha e admin
  services/     disponibilidade, entregas, preços, relatórios e pagamentos
  styles/       sistema visual responsivo
  utils/        formatação de tempo, telefone e funções
supabase/
  schema.sql    tabelas, triggers, RLS, RPCs e Realtime
  migrations/   atualizações incrementais para bancos já existentes
public/         ícones e marca da PWA
```

Para trocar a marca futuramente, edite `src/config/brand.js`, os metadados em `vite.config.js` e substitua os SVGs em `public/`.

## Observações operacionais

- `last_seen` é atualizado ao abrir o painel do motoboy e a cada 2 minutos enquanto ele estiver online.
- A cozinha sinaliza visualmente motoboys disponíveis sem atividade há 10 minutos, mas não os remove automaticamente.
- Ao reconectar, as páginas consultam o servidor novamente; a alteração de disponibilidade fica bloqueada offline para evitar um estado local incorreto.
- Exclusão administrativa remove contas sem histórico. Contas que já possuem entregas ou fechamentos devem ser desativadas para preservar a trilha financeira e de auditoria.
- A identidade visual principal usa `public/octopus-logo.jpg`; os ícones PNG de 192 px, 512 px e maskable da PWA são derivados da mesma logo.
- O relatório administrativo possui filtros para hoje, ontem, semanas, meses e período personalizado, além de exportações CSV.
- A busca rápida de pedidos consulta todas as datas. Os filtros do relatório combinam pedido, motoboy, período, status, faixa de KM e pagamento.
- O detalhe administrativo mostra dados completos, fechamento e trilha de auditoria; a área de conferência resume os pedidos de um motoboy em uma data.
