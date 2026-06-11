/**
 * Trích xuất message từ lỗi API một cách có nghĩa.
 * - 403 → thông báo quyền hạn từ backend (hoặc mặc định)
 * - 404 → không tìm thấy
 * - 422 → dữ liệu không hợp lệ
 * - 409 → trùng dữ liệu
 * - khác → thông báo chung
 */
export function getApiErrorMessage(
  err: unknown,
  fallback = 'Có lỗi xảy ra. Vui lòng thử lại.',
): string {
  const e = err as any
  const status: number | undefined = e?.response?.status
  const detail = e?.response?.data?.detail

  // Ưu tiên lấy message từ backend trả về
  const backendMsg: string | undefined =
    typeof detail === 'string'
      ? detail
      : typeof detail?.message === 'string'
      ? detail.message
      : undefined

  switch (status) {
    case 403:
      return backendMsg ?? 'Bạn không có quyền thực hiện thao tác này.'
    case 401:
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
    case 404:
      return backendMsg ?? 'Không tìm thấy dữ liệu yêu cầu.'
    case 409:
      return backendMsg ?? 'Dữ liệu đã tồn tại trong hệ thống.'
    case 422:
      return backendMsg ?? 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.'
    case 500:
      return 'Máy chủ gặp sự cố. Vui lòng thử lại sau.'
    default:
      return backendMsg ?? fallback
  }
}
