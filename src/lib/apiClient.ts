async function handleResponse(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = typeof body.error === "string" ? body.error : "Request failed";
    throw new Error(message);
  }
  return res.json();
}

function request(url: string, method: string, data?: unknown) {
  return fetch(url, {
    method,
    headers: data !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  }).then(handleResponse);
}

export const api = {
  createTask: (data: unknown) => request("/api/tasks", "POST", data),
  updateTask: (id: string, data: unknown) => request(`/api/tasks/${id}`, "PATCH", data),
  deleteTask: (id: string) => request(`/api/tasks/${id}`, "DELETE"),
  bulkUpdateTasks: (data: unknown) => request("/api/tasks/bulk", "PATCH", data),
  bulkDeleteTasks: (taskIds: string[]) => request("/api/tasks/bulk", "DELETE", { taskIds }),
  addTaskComment: (taskId: string, message: string) => request(`/api/tasks/${taskId}/events`, "POST", { message }),
  updateTaskComment: (taskId: string, eventId: string, message: string) =>
    request(`/api/tasks/${taskId}/events/${eventId}`, "PATCH", { message }),
  deleteTaskComment: (taskId: string, eventId: string) => request(`/api/tasks/${taskId}/events/${eventId}`, "DELETE"),
  emailCustomer: (taskId: string, message: string, recipients: string[] = [], file?: File | null) => {
    const form = new FormData();
    form.set("message", message);
    form.set("recipients", recipients.join(","));
    if (file) form.set("file", file);
    return fetch(`/api/tasks/${taskId}/email-customer`, { method: "POST", body: form }).then(handleResponse);
  },
  duplicateTask: (taskId: string, projectId?: string) => request(`/api/tasks/${taskId}/duplicate`, "POST", { projectId }),
  createPersonalTask: (data: unknown) => request("/api/tasks/personal", "POST", data),
  fetchExportDetail: (taskIds: string[]) => request("/api/tasks/export-detail", "POST", { taskIds }),
};
