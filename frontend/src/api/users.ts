import apiClient from './client'
import type { User } from '../types'

export const usersApi = {
  list: () => apiClient.get<User[]>('/users'),
}
