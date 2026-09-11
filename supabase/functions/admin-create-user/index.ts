import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Função administrativa não configurada no servidor' }, 503)
  }

  const authorization = request.headers.get('Authorization')
  const accessToken = authorization?.replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'Sessão obrigatória' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken)
  if (authError || !authData.user) return json({ error: 'Sessão inválida' }, 401)

  const { data: caller } = await admin
    .from('profiles')
    .select('role, active')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (!caller?.active || caller.role !== 'admin') {
    return json({ error: 'Acesso exclusivo do administrador' }, 403)
  }

  let requestBody: Record<string, unknown>
  try {
    requestBody = await request.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido' }, 400)
  }

  const fullName = text(requestBody.fullName)
  const username = text(requestBody.username).toLocaleLowerCase('pt-BR')
  const phone = text(requestBody.phone)
  const email = text(requestBody.email).toLocaleLowerCase('pt-BR')
  const password = text(requestBody.password)
  const role = text(requestBody.role)
  const motorcycleModel = role === 'motoboy' ? text(requestBody.motorcycleModel) : ''
  const motorcyclePlate = role === 'motoboy' ? text(requestBody.motorcyclePlate).toUpperCase() : ''

  if (fullName.length < 3 || fullName.length > 120) return json({ error: 'Informe o nome completo' }, 400)
  if (!/^[\p{L}\p{N}._-]{3,40}$/u.test(username)) return json({ error: 'O usuário deve ter de 3 a 40 caracteres, sem espaços' }, 400)
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return json({ error: 'Informe um e-mail válido' }, 400)
  if (phone.replace(/\D/g, '').length < 10 || phone.length > 20) return json({ error: 'Informe um telefone válido' }, 400)
  if (password.length < 8 || password.length > 72) return json({ error: 'A senha deve ter entre 8 e 72 caracteres' }, 400)
  if (!['motoboy', 'kitchen', 'admin'].includes(role)) return json({ error: 'Função de usuário inválida' }, 400)
  if (motorcyclePlate.length > 7) return json({ error: 'A placa da moto é inválida' }, 400)

  const [{ data: sameUsername, error: usernameLookupError }, { data: sameEmail, error: emailLookupError }] = await Promise.all([
    admin.from('profiles').select('id').eq('username', username).maybeSingle(),
    admin.from('profiles').select('id').eq('email', email).maybeSingle(),
  ])
  if (usernameLookupError || emailLookupError) return json({ error: 'Não foi possível validar o cadastro' }, 500)
  if (sameUsername) return json({ error: 'Este nome de usuário já está em uso' }, 409)
  if (sameEmail) return json({ error: 'Este e-mail já possui cadastro' }, 409)

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      username,
      phone,
      motorcycle_model: motorcycleModel || null,
      motorcycle_plate: motorcyclePlate || null,
    },
  })

  if (createError || !created.user) {
    const message = createError?.message.toLocaleLowerCase().includes('already')
      ? 'Este e-mail já possui cadastro'
      : 'Não foi possível criar o usuário'
    return json({ error: message }, createError?.status ?? 500)
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: fullName,
      username,
      phone,
      motorcycle_model: motorcycleModel || null,
      motorcycle_plate: motorcyclePlate || null,
      role,
      active: true,
    })
    .eq('id', created.user.id)
    .select('*')
    .single()

  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(created.user.id)
    return json({ error: 'A conta não pôde ser finalizada e foi desfeita' }, 500)
  }

  await admin.from('audit_logs').insert({
    user_id: authData.user.id,
    action: 'user_created',
    entity_type: 'profile',
    entity_id: created.user.id,
    new_data: { full_name: fullName, username, email, role },
  })

  return json({ profile }, 201)
})
