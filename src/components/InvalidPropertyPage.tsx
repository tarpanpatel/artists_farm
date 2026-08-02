import React, { useState, useEffect } from 'react';
import { AlertCircle, Home, ArrowRight } from 'lucide-react';
import { fetchPropertyModulesFromDB } from '../services/api';

interface Property {
  id: number;
  slug: string;
  name: string;
  tenant_id?: number;
}

export const InvalidPropertyPage: React.FC<{ propertySlug?: string }> = ({ propertySlug }) => {
  const [availableProperties, setAvailableProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch available properties from a dedicated API endpoint
    const loadProperties = async () => {
      try {
        // For now, show a message to contact admin
        setLoading(false);
      } catch (err) {
        console.error('Failed to load properties:', err);
        setLoading(false);
      }
    };
    loadProperties();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-8">
        {/* Error Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950/50 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
        </div>

        {/* Error Message */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
          Access Denied
        </h1>
        <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
          You don't have access to this resource. Please contact your administrator if you believe this is an error.
        </p>


        {/* Action Button */}
        <a
          href="/artists_farm/"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <Home className="w-4 h-4" />
          Go to Home
        </a>

        {/* Help Text */}
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
          If you believe this is an error, please contact your administrator.
        </p>
      </div>
    </div>
  );
};
