/**
 * Generates the exact HTML body matching the production .eml files.
 */
const buildQuoteEmailHtml = ({ recipientFirstName, projectName }) => {
    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=Windows-1252">
</head>
<body dir="ltr" style="font-family: Aptos, sans-serif; font-size: 12pt; color: rgb(36, 36, 36);">
<div>Hi ${recipientFirstName},</div>
<br>
<div><b>Schedule of Rates – Concrete Pumping at ${projectName}</b></div>
<br>
<div>We would like to supply you with our rates for the concrete pumping works, please see our schedule of rates attached.</div>
<br>
<div>Our experience in this industry is extensive, from small pool surrounds to high rise buildings, we pride ourselves on being able to provide the best services possible for our clientele. We are highly experienced in commercial high-rise buildings and large industrial sheds.</div>
<br>
<div>We have a large fleet of mobile concrete pumps ranging from high pressure Line Pumps through to 56 Metre Booms, along with a Spider Boom &amp; a Satellite Pump.</div>
<br>
<div>All our Boom pump operators hold a 3<sup>rd</sup> party VOC.</div>
<br>
<div>Our fleet is highly maintained and we have all the required safety documentation in place and up to date.</div>
<br>
<div>Chris would like to discuss any feedback you may have, please don’t hesitate to contact him directly on 0461 459 755.</div>
<br>
<div>Thank you and have a lovely day.</div>
<br>
<div id="Signature" style="font-family: Gadugi, sans-serif;">
    <div style="font-size: 12pt; color: rgb(21, 96, 130);"><b>Steve</b></div>
    <div style="font-size: 12pt; color: black;">BPA <span style="color: rgb(36, 36, 36);">Sales</span> Team</div>
    <br>
    <div style="font-size: 10pt; color: rgb(89, 89, 89);">
        Brisbane Pump Action Pty Ltd<br>
        PO Box 1336, Burpengary DC Qld 4505<br>
        Pump Bookings: 0410 158 451<br>
        Pump Allocations: 0438 930 580<br>
        Ph: 07 3888 2660<br>
        Fax: 07 3888 4412<br>
        <a href="http://www.brisbanepumpaction.com.au/" style="color: rgb(5, 99, 193);">www.brisbanepumpaction.com.au</a>
    </div>
</div>
</body>
</html>`;
};

module.exports = {
    buildQuoteEmailHtml
};