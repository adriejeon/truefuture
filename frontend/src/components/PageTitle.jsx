import { Link } from "react-router-dom";

function PageTitle() {
  return (
    <Link to="/" className="block">
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-6 sm:mb-8 text-primary px-2 hover:opacity-80 transition-opacity cursor-pointer">
        진짜미래
      </h1>
    </Link>
  );
}

export default PageTitle;
