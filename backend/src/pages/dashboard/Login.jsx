import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Simulate login for now since auth backend might not be ready
    try {
      // In a real app, this would be an API call
      // await authService.login(username, password);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (username && password) {
        // Mock successful login
        localStorage.setItem('user', JSON.stringify({ username }));
        navigate('/devices');
      } else {
        setError('Please enter both username and password');
      }
    } catch (err) {
      setError('Failed to login. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="card login-card">
          <div className="card-header login-header">
            <h2>Sign In</h2>
            <p className="card-subtitle">Access VapeGuard System</p>
          </div>
          
          <div className="card-body">
            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <div className="form-group mb-3">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  className="form-control"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  autoFocus
                />
              </div>
              
              <div className="form-group mb-4">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  className="form-control"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>
              
              <button 
                type="submit" 
                className="btn btn-primary btn-block w-100" 
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>
          <div className="card-footer text-center">
            <small className="text-muted">
              Don't have an account? Contact your administrator.
            </small>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
