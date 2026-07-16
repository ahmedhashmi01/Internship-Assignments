import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import { fetchUsers, deleteUser } from "../../features/users/usersSlice";
import "./dashboard.css";

function Dashboard() {
  const dispatch = useDispatch();
  const location = useLocation();
  const { users, loading, error } = useSelector((state) => state.users);
  const [res, setRes] = useState("");
  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  const handleDeleteUser = async (userId) => {
    try {
      const response = await dispatch(deleteUser(userId)).unwrap();
      setRes(response.message);
      console.log("User deleted successfully:", response);
    } catch (requestError) {
      console.error("Delete user failed:", requestError);
    }
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <h5>Welcome, {location.state?.name || "User"}!</h5>
      </div>

      {location.state?.message && (
        <p className="dashboard-message">{location.state.message}</p>
      )}

      {loading && <p className="dashboard-status">Loading...</p>}

      {error && <p className="dashboard-error">Error: {error}</p>}

      {users.length > 0 && (
        <div className="dashboard-table-wrapper">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => {
                const userId = user.id || user._id;

                return (
                  <tr key={userId}>
                    <td>{userId}</td>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>
                      <button
                        className="dashboard-delete-button"
                        type="button"
                        onClick={() => handleDeleteUser(userId)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {res && <p className="dashboard-response">{res}</p>}
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <p className="dashboard-empty">No users found.</p>
      )}
    </div>
  );
}

export default React.memo(Dashboard);
