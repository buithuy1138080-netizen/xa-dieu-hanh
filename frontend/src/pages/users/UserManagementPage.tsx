import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function UserManagementPage() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/staff', { replace: true }) }, [navigate])
  return null
}
