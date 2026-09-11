import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, CheckCircle2, Pencil, Search, ShieldCheck, Trash2, UserPlus, UserRoundX, UsersRound } from 'lucide-react'
import AdminUserEditor from '../components/AdminUserEditor'
import AdminUserCreator from '../components/AdminUserCreator'
import AdminOperations from '../components/AdminOperations'
import EmptyState from '../components/EmptyState'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { requireSupabase } from '../lib/supabase'
import { adminDeleteUser, getAllProfiles } from '../services/profileService'
import { formatDateTime, getInitials, roleLabels } from '../utils/formatters'

const filters = [
  { id: 'all', label: 'Todos' },
  { id: 'available', label: 'Disponíveis' },
  { id: 'unavailable', label: 'Indisponíveis' },
]

function getOperationalStatus(profile) {
  const availability = Array.isArray(profile.availability) ? profile.availability[0] : profile.availability
  return availability?.status ?? (availability?.is_available ? 'available' : 'offline')
}
function isAvailable(profile) {
  return getOperationalStatus(profile) === 'available'
}

export default function AdminPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [section, setSection] = useState('operations')

  const load = useCallback(async () => {
    try {
      setProfiles(await getAllProfiles())
    } catch (error) {
      showToast(`Não foi possível carregar os usuários: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
    const client = requireSupabase()
    let timer
    const refresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(load, 180)
    }
    const channel = client.channel(`admin-live-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'availability' }, refresh)
      .subscribe()
    return () => {
      window.clearTimeout(timer)
      client.removeChannel(channel)
    }
  }, [load])

  const visibleProfiles = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return profiles.filter((profile) => {
      const matchesSearch = !term || `${profile.full_name} ${profile.username} ${profile.email}`.toLocaleLowerCase('pt-BR').includes(term)
      const available = isAvailable(profile)
      const matchesFilter = filter === 'all' || (filter === 'available' && available) || (filter === 'unavailable' && !available)
      return matchesSearch && matchesFilter
    })
  }, [filter, profiles, search])

  const availableCount = profiles.filter(isAvailable).length
  const inactiveCount = profiles.filter((profile) => !profile.active).length

  const remove = async (profile) => {
    if (profile.id === user.id) return
    const confirmed = window.confirm(`Excluir permanentemente a conta de ${profile.full_name}? Esta ação não pode ser desfeita.`)
    if (!confirmed) return
    setDeleting(profile.id)
    try {
      await adminDeleteUser(profile.id)
      setProfiles((items) => items.filter((item) => item.id !== profile.id))
      showToast('Usuário excluído.')
    } catch (error) {
      showToast(`Não foi possível excluir: ${error.message}`, 'error')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="admin-page page-container page-container--wide">
      <header className="page-intro">
        <div><p className="eyebrow">Painel administrativo</p><h1>Central de controle</h1><p>Operação, pagamentos e equipe em um só lugar.</p></div>
      </header>
      <div className="admin-section-tabs"><button type="button" className={section === 'operations' ? 'active' : ''} onClick={() => setSection('operations')}><BarChart3 /> Entregas e pagamentos</button><button type="button" className={section === 'users' ? 'active' : ''} onClick={() => setSection('users')}><UsersRound /> Usuários</button></div>
      {section === 'operations' ? <AdminOperations profiles={profiles} /> : <>
      <section className="admin-stats">
        <div><span className="stat-icon"><UsersRound /></span><p>Total de usuários<strong>{profiles.length}</strong></p></div>
        <div><span className="stat-icon stat-icon--green"><CheckCircle2 /></span><p>Disponíveis agora<strong>{availableCount}</strong></p></div>
        <div><span className="stat-icon stat-icon--red"><UserRoundX /></span><p>Contas inativas<strong>{inactiveCount}</strong></p></div>
      </section>

      <section className="admin-panel">
        <div className="admin-toolbar">
          <label className="search-box"><Search size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, usuário ou e-mail" /></label>
          <button type="button" className="button button--primary admin-create-button" onClick={() => setCreating(true)}><UserPlus size={18} /> Cadastrar usuário</button>
          <div className="filter-tabs" role="group" aria-label="Filtrar usuários">
            {filters.map((item) => <button type="button" key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}
          </div>
        </div>
        <div className="result-count">{visibleProfiles.length} {visibleProfiles.length === 1 ? 'usuário encontrado' : 'usuários encontrados'}</div>
        {loading ? <div className="queue-loading"><span className="spinner" /> Carregando usuários...</div> : visibleProfiles.length === 0 ? (
          <EmptyState icon={Search} title="Nenhum usuário encontrado" description="Tente outro termo ou altere o filtro selecionado." />
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead><tr><th>Usuário</th><th>Função</th><th>Status</th><th>Cadastro</th><th>Último acesso</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {visibleProfiles.map((profile) => {
                  const available = isAvailable(profile)
                  const operationalStatus = getOperationalStatus(profile)
                  return (
                    <tr key={profile.id} className={!profile.active ? 'row-inactive' : ''}>
                      <td data-label="Usuário"><div className="user-cell"><span className="avatar avatar--small">{getInitials(profile.full_name)}</span><span><strong>{profile.full_name}</strong><small>@{profile.username} · {profile.email}</small></span></div></td>
                      <td data-label="Função"><span className={`role-badge role-badge--${profile.role}`}><ShieldCheck size={14} />{roleLabels[profile.role]}</span></td>
                      <td data-label="Status"><span className={`table-status ${available ? 'table-status--on' : operationalStatus === 'on_delivery' ? 'table-status--delivery' : ''}`}><i />{!profile.active ? 'Conta inativa' : available ? 'Disponível' : operationalStatus === 'on_delivery' ? 'Em entrega' : 'Indisponível'}</span></td>
                      <td data-label="Cadastro">{formatDateTime(profile.created_at)}</td>
                      <td data-label="Último acesso">{formatDateTime(profile.last_seen)}</td>
                      <td className="table-actions">
                        <button type="button" className="icon-button" onClick={() => setEditing(profile)} title="Editar usuário"><Pencil size={17} /></button>
                        <button type="button" className="icon-button icon-button--danger" onClick={() => remove(profile)} disabled={profile.id === user.id || deleting === profile.id} title={profile.id === user.id ? 'Você não pode excluir sua própria conta' : 'Excluir usuário'}>{deleting === profile.id ? <span className="button-spinner" /> : <Trash2 size={17} />}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>}
      <AdminUserCreator open={creating} onClose={() => setCreating(false)} onSaved={load} />
      <AdminUserEditor userProfile={editing} open={Boolean(editing)} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  )
}
