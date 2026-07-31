import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import {
  deleteUser,
  fetchUsers,
  updateUser,
} from "app/features/users/usersSlice";
import "./dashboard.css";

function Dashboard() {
  const dispatch = useDispatch();
  const location = useLocation();

  const currentUser = useSelector((state) => state.auth.user);
  const { users, loading, error } = useSelector((state) => state.users);

  const [res, setRes] = useState("");
  const [editingUserId, setEditingUserId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  const handleDeleteUser = async (userId) => {
    try {
      const response = await dispatch(deleteUser(userId)).unwrap();
      setRes(response.message);
    } catch (requestError) {
      console.error("Delete user failed:", requestError);
    }
  };

  const startEditingUser = (user) => {
    setEditingUserId(user.id || user._id);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPassword("");
    setRes("");
  };

  const cancelEditingUser = () => {
    setEditingUserId(null);
    setEditName("");
    setEditEmail("");
    setEditPassword("");
    setRes("");
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();

    try {
      await dispatch(
        updateUser({
          id: editingUserId,
          name: editName,
          email: editEmail,
          password: editPassword || undefined,
        })
      ).unwrap();

      setRes("User updated successfully");
      setEditingUserId(null);
      setEditName("");
      setEditEmail("");
      setEditPassword("");
    } catch (requestError) {
      console.error("Update user failed:", requestError);
      setRes(requestError || "Unable to update user");
    }
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <h5>Welcome, {currentUser?.name || location.state?.name || "User"}!</h5>
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
                        className="dashboard-edit-button"
                        type="button"
                        onClick={() => startEditingUser(user)}
                      >
                        Edit
                      </button>
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

      {editingUserId && (
        <div className="dashboard-edit-panel">
          <h2>Edit User</h2>
          <form className="dashboard-edit-form" onSubmit={handleUpdateUser}>
            <input
              type="text"
              value={editName}
              placeholder="Name"
              onChange={(event) => setEditName(event.target.value)}
              required
            />
            <input
              type="email"
              value={editEmail}
              placeholder="Email"
              onChange={(event) => setEditEmail(event.target.value)}
              required
            />
            <input
              type="password"
              value={editPassword}
              placeholder="New password (leave blank to keep existing)"
              onChange={(event) => setEditPassword(event.target.value)}
            />
            <div className="dashboard-edit-actions">
              <button type="submit">Save</button>
              <button type="button" onClick={cancelEditingUser}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <p className="dashboard-empty">No users found.</p>
      )}
    </div>
  );
}

export default React.memo(Dashboard);
