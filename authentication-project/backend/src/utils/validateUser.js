class ValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);

    this.name = "ValidationError";
    this.statusCode = statusCode;
  }
}

export const validateSignup = ({ name, email, password }) => {
  if (!name || !email || !password) {
    throw new ValidationError("All fields are required");
  }

  if (!email.includes("@")) {
    throw new ValidationError("Please enter a valid email address");
  }

  if (password.length < 6) {
    throw new ValidationError("Password must be at least 6 characters");
  }
};

export const validateSignin = ({ email, password }) => {
  if (!email || !password) {
    throw new ValidationError("Email and password are required");
  }

  if (!email.includes("@")) {
    throw new ValidationError("Please enter a valid email address");
  }
};

export const validateUpdateUser = ({ id, name, email, password }) => {
  if (!id) {
    throw new ValidationError("User ID is required");
  }

  if (!name && !email && !password) {
    throw new ValidationError("At least one field is required for update");
  }

  if (email && !email.includes("@")) {
    throw new ValidationError("Please enter a valid email address");
  }

  if (password && password.length < 6) {
    throw new ValidationError("Password must be at least 6 characters");
  }
};

export const validateDeleteUser = ({ id }) => {
  if (!id) {
    throw new ValidationError("User ID is required");
  }
};
