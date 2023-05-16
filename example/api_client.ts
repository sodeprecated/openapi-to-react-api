import { API_BASE_URL } from "./constants";
import { User, Pet } from "./data_contracts";
import { fetchWrapper } from "./fetch_wrapper";

export const api = {
  Users: {
    /**
     * @example 200: "OK"
     */
    getAll: () => {
      return fetchWrapper.send<User[]>(`${API_BASE_URL}/users`, {
        method: "GET",
      });
    },
    /**
     * @example 200: "OK"
     */
    getById: () => {
      return fetchWrapper.send<User>(`${API_BASE_URL}/users/:id`, {
        method: "GET",
      });
    },
  },

  Pets: {
    /**
     * @example 200: "OK"
     */
    getAll: () => {
      return fetchWrapper.send<Pet[]>(`${API_BASE_URL}/pets`, {
        method: "GET",
      });
    },
  },
};
