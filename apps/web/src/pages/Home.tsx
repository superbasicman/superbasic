import { Link } from 'react-router-dom';
import { Button } from '@repo/design-system';
import { useAuth } from '../contexts/AuthContext';

function Home() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white">SuperBasic Finance</h1>
        <p className="mt-4 text-lg text-gray-200">Your API-first personal finance platform</p>
        
        {user && (
          <div className="mt-8 space-y-4">
            <div className="rounded-lg bg-gray-800 p-6">
              <p className="text-sm text-gray-400">Logged in as</p>
              <p className="mt-1 text-lg font-medium text-white">{user.email}</p>
              {user.name && (
                <p className="mt-1 text-sm text-gray-300">{user.name}</p>
              )}
            </div>
            
            <div className="flex flex-col gap-3">
              <Link to="/settings/api-keys">
                <Button
                  variant="primary"
                  className="w-full"
                >
                  Manage API Keys
                </Button>
              </Link>
              
              <Button
                variant="secondary"
                onClick={() => logout()}
                className="w-full"
              >
                Sign out
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
