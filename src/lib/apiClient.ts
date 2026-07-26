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
};
