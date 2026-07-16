import { useCallback, useState, useMemo } from "react";

const useFetch = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendRequest = useCallback(async (url, options = {}) => {
    setLoading(true);
    setError("");
    setData(null);

    try {
      const response = await fetch(url, options);
      const contentType = response.headers.get("content-type");

      if (!contentType?.includes("application/json")) {
        throw new Error("The server returned an invalid response");
      }

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.message || "Request failed");
      }
      // fetch() does not throw automatically for
      // 400, 401, 404 or 500 responses.
      if (!response.ok) {
        throw new Error(responseData.message || "Request failed");
      }

      setData(responseData);

      return responseData;
    } catch (requestError) {
      setError(requestError.message || "Unable to connect to the server");

      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchValues = useMemo(
    () => ({
      data,
      error,
      loading,
    }),
    [data, error, loading]
  );

  return {
    ...fetchValues,
    sendRequest,
  };
};

export default useFetch;
