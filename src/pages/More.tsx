import './More.css';

export default function More() {
  return (
    <div className="more-container">
      <iframe
        src="/about/index.html"
        title="About GameTOK"
        className="more-iframe"
      />
    </div>
  );
}
