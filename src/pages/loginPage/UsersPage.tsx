import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { UsersSection } from "../hubPage/components/views/settings/UsersSection";
import "./UsersPage.scss";

export default function UsersPage() {
  const navigate = useNavigate();

  return (
    <div className="users-page">
      <div className="page-top-nav">
        <button
          type="button"
          className="btn-back-prominent"
          onClick={() => navigate("/hub")}
        >
          <ArrowLeft size={16} />
          <span>Back to Hub</span>
        </button>
      </div>
      <div className="users-page-content">
        <UsersSection />
      </div>
    </div>
  );
}
