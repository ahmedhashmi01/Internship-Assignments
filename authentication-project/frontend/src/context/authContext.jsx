import {
  useContext,
  createContext,
  useState,
  useCallback,
  useMemo,
} from "react";

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const isAuthenticated = Boolean(user);

  const login = useCallback((loggedInUser) => {
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  const authValues = useMemo(
    () => ({
      user,
      isAuthenticated,
    }),
    [user, isAuthenticated]
  );

  return (
    <AuthContext.Provider
      value={{
        ...authValues,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
