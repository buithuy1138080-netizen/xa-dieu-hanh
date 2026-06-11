import apiClient from './client'
import type { User } from '../types'

export interface UserPublic {
  id: number
  username: string
  full_name: string | null
  is_active: boolean
  staff_id?: number | null
  department_id?: number | null
}

export const usersApi = {
  list: () => apiClient.get<User[]>('/users'),
  names: () => apiClient.get<UserPublic[]>('/users/names'),
}
