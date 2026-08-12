import { useState, useEffect } from 'react'
import { companyAPI } from '../services/api'

/**
 * Company branding strip for report headers — logo, name, address. Renders nothing until
 * a company name/logo is actually configured (Administration > Company Settings), so pages
 * embedding this don't show an empty placeholder box on a fresh deployment.
 */
export default function CompanyHeader({ className = '' }) {
  const [company, setCompany] = useState(null)

  useEffect(() => {
    companyAPI.get().then(({ data }) => setCompany(data)).catch(() => {})
  }, [])

  if (!company || (!company.company_name && !company.logo)) return null

  return (
    <div className={`flex items-center gap-4 pb-4 mb-4 border-b border-slate-200 print:border-black ${className}`}>
      {company.logo && (
        <img src={company.logo} alt={company.company_name} className="h-14 w-auto object-contain" />
      )}
      <div>
        {company.company_name && <p className="font-bold text-lg text-slate-800">{company.company_name}</p>}
        <p className="text-xs text-slate-500">
          {[company.address, company.city].filter(Boolean).join(', ')}
        </p>
        <p className="text-xs text-slate-500">
          {[company.phone, company.email].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  )
}
