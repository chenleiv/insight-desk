import { Loader } from "../loader/Loader";
import { isReloadingForStaleAsset } from "../../utils/staleAssetReload";
import "./errorPage.scss";

// Shown when a page fails to render. It tells the visitor nothing about the error itself.
export function ErrorPage() {
  if (isReloadingForStaleAsset()) {
    return (
      <div className="error-page">
        <Loader size={32} />
      </div>
    );
  }

  return (
    <div className="error-page" role="alert">
      <h1>Something went wrong</h1>
      <p>This page could not be loaded. Reloading usually fixes it.</p>
      <button type="button" className="primary-btn" onClick={() => window.location.reload()}>
        Reload page
      </button>
    </div>
  );
}
