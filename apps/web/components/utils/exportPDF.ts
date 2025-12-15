import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function exportElementAsPdf(element: HTMLElement, fileName = "dashboard.pdf") {
  const canvas = await html2canvas(element, { scale: 2 });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const ratio = canvas.width / canvas.height;
  const pdfHeight = pageWidth / ratio;

  pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pdfHeight);
  pdf.save(fileName);
}
