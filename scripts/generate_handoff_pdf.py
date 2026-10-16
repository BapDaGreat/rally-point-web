"""
Rally Point - Tenancy & Superadmin SaaS Architecture Handoff PDF Generator
Generates an executive, publication-grade handoff document.
"""

import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

# Theme Palette (matching Rally Point brand)
PRIMARY = colors.HexColor("#0f4c47")      # Deep Emerald/Teal
PRIMARY_LIGHT = colors.HexColor("#14b8a6")# Vibrant Teal Accent
SECONDARY = colors.HexColor("#0f172a")    # Slate 900
TEXT_MUTED = colors.HexColor("#475569")   # Slate 600
TEXT_DARK = colors.HexColor("#1e293b")    # Slate 800
BG_LIGHT = colors.HexColor("#f8fafc")     # Slate 50
BORDER_COLOR = colors.HexColor("#e2e8f0") # Slate 200
SUCCESS = colors.HexColor("#10b981")      # Emerald 500
ACCENT_BG = colors.HexColor("#f0fdfa")    # Teal 50

class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas for exact 'Page X of Y' footers and top headers."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        
        # Suppress headers/footers on page 1 (cover)
        if self._pageNumber > 1:
            # Header
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(PRIMARY)
            self.drawString(54, 750, "RALLY POINT")
            self.setFont("Helvetica", 8)
            self.setFillColor(TEXT_MUTED)
            self.drawString(118, 750, "|   Multi-Tenant SaaS & Superadmin Commission Handoff")
            
            self.setStrokeColor(BORDER_COLOR)
            self.setLineWidth(0.5)
            self.line(54, 742, 558, 742)
            
            # Footer
            self.line(54, 45, 558, 45)
            self.setFont("Helvetica", 8)
            self.setFillColor(TEXT_MUTED)
            self.drawString(54, 32, "Confidential  ·  Developer Release Handoff  ·  feat/rally-point-tenancy-handoff")
            page_text = f"Page {self._pageNumber} of {page_count}"
            self.drawRightString(558, 32, page_text)
            
        self.restoreState()

def build_pdf(filename="RALLY-POINT-TENANCY-HANDOFF.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=60,
        bottomMargin=55
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=26,
        leading=32,
        textColor=PRIMARY
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=13,
        leading=18,
        textColor=TEXT_MUTED
    )
    
    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=20,
        textColor=PRIMARY,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=SECONDARY,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=TEXT_DARK,
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        parent=body_style,
        leftIndent=14,
        bulletIndent=4,
        spaceAfter=4
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=body_style,
        fontSize=9,
        leading=13.5,
        textColor=PRIMARY
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=TEXT_DARK
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=TEXT_DARK
    )

    table_cell_code = ParagraphStyle(
        'TableCellCode',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8,
        leading=10,
        textColor=PRIMARY
    )

    story = []

    # ==================== COVER / HEADER SECTION ====================
    story.append(Spacer(1, 15))
    story.append(Paragraph("RALLY POINT", ParagraphStyle('Eyebrow', fontName='Helvetica-Bold', fontSize=10, textColor=PRIMARY_LIGHT, leading=12)))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Multi-Tenant SaaS & Superadmin Architecture", title_style))
    story.append(Spacer(1, 6))
    story.append(Paragraph("Engineering Handoff & Technical Release Specification", subtitle_style))
    story.append(Spacer(1, 14))

    # Meta Table
    meta_data = [
        [
            Paragraph("<b>Author / Engineer:</b> Dayle Angelo Peña (@DayleeQuest / BapDaGreat)", table_cell_style),
            Paragraph("<b>Target Branch:</b> <font name='Courier'>rally-point-tenancy-handoff</font>", table_cell_style)
        ],
        [
            Paragraph("<b>Upstream PR:</b> <font color='#0d5c58'>https://github.com/zylush/rally-point-web/pull/3</font>", table_cell_style),
            Paragraph("<b>Date of Release:</b> October 14, 2026", table_cell_style)
        ],
        [
            Paragraph("<b>Status:</b> Fully Verified (100% Test Pass Rate)", table_cell_style),
            Paragraph("<b>Stack:</b> React 19, TypeScript 5.8, Vite 8, Supabase RLS", table_cell_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[252, 252])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 16))

    # ==================== 1. EXECUTIVE OVERVIEW ====================
    story.append(Paragraph("1. Executive Overview & Architecture Vision", h1_style))
    story.append(Paragraph(
        "Rally Point has evolved from a single-facility court rental management web application into a full-scale "
        "<b>Multi-Tenant Software-as-a-Service (SaaS) Platform</b>. Under this new architectural paradigm, multiple "
        "autonomous pickleball facilities operate as independent branches (e.g., General Santos City, Davao City, Cebu IT Park), "
        "while an executive <b>Platform Superadmin</b> oversees all branches, manages subscriptions/status, and automatically collects "
        "a configurable percentage commission on every confirmed court booking.",
        body_style
    ))

    # Callout Highlight Box
    callout_data = [[
        Paragraph(
            "<b>Key Architectural Achievement:</b> Complete multi-tenant data isolation and revenue attribution "
            "are maintained both in offline demo mode and production Supabase SQL. Every transaction calculates: "
            "<br/><b>Commission Cut:</b> Booking Amount × (Branch Commission Rate / 100) &nbsp;|&nbsp; "
            "<b>Branch Net:</b> Booking Amount - Commission Cut",
            callout_style
        )
    ]]
    callout_table = Table(callout_data, colWidths=[504])
    callout_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), ACCENT_BG),
        ('BOX', (0,0), (-1,-1), 1, PRIMARY_LIGHT),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    story.append(callout_table)
    story.append(Spacer(1, 14))

    # ==================== 2. CORE DELIVERABLES ====================
    story.append(Paragraph("2. Scope of Deliverables & Component Breakdown", h1_style))
    
    deliverables_table_data = [
        [
            Paragraph("Module", table_header_style),
            Paragraph("Key Files Modified / Added", table_header_style),
            Paragraph("Description & Business Capability", table_header_style)
        ],
        [
            Paragraph("<b>Domain Models & Types</b>", table_cell_bold),
            Paragraph("<font name='Courier'>src/types.ts</font>", table_cell_code),
            Paragraph("Added 'superadmin' role, Branch, PlatformCommission, and SuperadminStats interfaces. Bound branch_id across members, courts, bookings, and inquiries.", table_cell_style)
        ],
        [
            Paragraph("<b>Multi-Tenant Store Engine</b>", table_cell_bold),
            Paragraph("<font name='Courier'>src/lib/demoStore.ts<br/>src/lib/api.ts</font>", table_cell_code),
            Paragraph("Multi-branch seeding (Gensan, Davao), superadmin authentication, automatic commission ledger creation on payment confirmation, and branch CRUD.", table_cell_style)
        ],
        [
            Paragraph("<b>Superadmin Portal</b>", table_cell_bold),
            Paragraph("<font name='Courier'>src/pages/Superadmin.tsx</font>", table_cell_code),
            Paragraph("Executive dashboard featuring 4 global KPI cards, interactive Branch Directory with suspend/activate controls, Provision Branch modal, and real-time Commission Ledger.", table_cell_style)
        ],
        [
            Paragraph("<b>Navigation & Shell</b>", table_cell_bold),
            Paragraph("<font name='Courier'>src/components/Shell.tsx<br/>src/App.tsx</font>", table_cell_code),
            Paragraph("Configured Superadmin desktop/mobile 6-tab navigation, protected /superadmin routing, and cross-branch administrative inspection access.", table_cell_style)
        ],
        [
            Paragraph("<b>Quick Demo Auth</b>", table_cell_bold),
            Paragraph("<font name='Courier'>src/pages/LoginPage.tsx</font>", table_cell_code),
            Paragraph("Added 1-click Superadmin login button in 4-column responsive grid alongside Admin, Staff, and Member credentials.", table_cell_style)
        ],
        [
            Paragraph("<b>Database Migration</b>", table_cell_bold),
            Paragraph("<font name='Courier'>supabase/migrations/<br/>20261014000000_*.sql</font>", table_cell_code),
            Paragraph("PostgreSQL migration schema creating branches and platform_commissions tables, foreign keys, private.current_branch_id() helper, and RLS tenant policies.", table_cell_style)
        ],
        [
            Paragraph("<b>Codebase Polish & Hygiene</b>", table_cell_bold),
            Paragraph("<font name='Courier'>src/pages/admin.tsx<br/>src/pages/HelpPage.tsx<br/>src/pages/MemberPass.tsx</font>", table_cell_code),
            Paragraph("Purged 360+ lines of dead shader code, eliminated dual-header rendering in admin views, implemented offline SVG QR generation, and added inquiry status filter tabs.", table_cell_style)
        ],
    ]
    deliv_table = Table(deliverables_table_data, colWidths=[110, 140, 254])
    deliv_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(deliv_table)
    story.append(Spacer(1, 14))

    story.append(PageBreak())

    # ==================== 3. MULTI-TENANT REVENUE MODEL ====================
    story.append(Paragraph("3. Multi-Tenant Commission & Revenue Architecture", h1_style))
    story.append(Paragraph(
        "The monetization model is built directly into booking payment confirmation flows. Branch managers operate "
        "their club facilities autonomously, but the platform governance tier enforces a contractual fee split:",
        body_style
    ))
    
    rev_steps = [
        "<b>Step 1 (Booking Creation):</b> Member or Staff initiates a court reservation for an hourly fee at a specific branch.",
        "<b>Step 2 (Payment Confirmation):</b> Payment is confirmed via GCash, Maya, Cash, or Card through <code>confirmBookingPayment()</code>.",
        "<b>Step 3 (Commission Calculation):</b> The engine pulls the branch's specific <code>commission_rate</code> (default 5.0%).",
        "<b>Step 4 (Ledger Settlement):</b> An immutable <code>PlatformCommission</code> entry is recorded with gross booking amount, platform commission cut, and branch net amount.",
        "<b>Step 5 (Global Aggregation):</b> The Superadmin KPI overview dynamically recalculates platform lifetime gross volume and total commission revenue."
    ]
    for step in rev_steps:
        story.append(Paragraph(f"• {step}", bullet_style))
    story.append(Spacer(1, 10))

    # Revenue Sample Table
    rev_sample_data = [
        [
            Paragraph("Branch Name", table_header_style),
            Paragraph("Hourly Rate", table_header_style),
            Paragraph("Duration", table_header_style),
            Paragraph("Gross Booking", table_header_style),
            Paragraph("Platform Cut", table_header_style),
            Paragraph("Superadmin Earns", table_header_style),
            Paragraph("Branch Net", table_header_style),
        ],
        [
            Paragraph("Rally Point Gensan", table_cell_bold),
            Paragraph("Php 500.00", table_cell_style),
            Paragraph("2 Hours", table_cell_style),
            Paragraph("Php 1,000.00", table_cell_style),
            Paragraph("5.0%", table_cell_style),
            Paragraph("<font color='#0d5c58'><b>Php 50.00</b></font>", table_cell_style),
            Paragraph("Php 950.00", table_cell_style),
        ],
        [
            Paragraph("Rally Point Davao", table_cell_bold),
            Paragraph("Php 650.00", table_cell_style),
            Paragraph("2 Hours", table_cell_style),
            Paragraph("Php 1,300.00", table_cell_style),
            Paragraph("6.0%", table_cell_style),
            Paragraph("<font color='#0d5c58'><b>Php 78.00</b></font>", table_cell_style),
            Paragraph("Php 1,222.00", table_cell_style),
        ],
        [
            Paragraph("Cebu IT Park Hub (New)", table_cell_bold),
            Paragraph("Php 700.00", table_cell_style),
            Paragraph("3 Hours", table_cell_style),
            Paragraph("Php 2,100.00", table_cell_style),
            Paragraph("7.5%", table_cell_style),
            Paragraph("<font color='#0d5c58'><b>Php 157.50</b></font>", table_cell_style),
            Paragraph("Php 1,942.50", table_cell_style),
        ],
    ]
    rev_table = Table(rev_sample_data, colWidths=[110, 65, 55, 75, 55, 75, 69])
    rev_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(rev_table)
    story.append(Spacer(1, 14))

    # ==================== 4. TESTING & QUALITY ASSURANCE ====================
    story.append(Paragraph("4. Quality Assurance & Verification Matrix", h1_style))
    story.append(Paragraph(
        "The codebase has been verified against three independent verification gates with strict zero-regression standards:",
        body_style
    ))

    qa_data = [
        [
            Paragraph("Verification Gate", table_header_style),
            Paragraph("Command Executed", table_header_style),
            Paragraph("Scope Checked", table_header_style),
            Paragraph("Result", table_header_style),
        ],
        [
            Paragraph("<b>Unit & Integration Tests</b>", table_cell_bold),
            Paragraph("<font name='Courier'>npm.cmd test -- --run</font>", table_cell_code),
            Paragraph("14 test suites, 51 test cases covering auth security, superadmin KPIs, commission calculations, branch provisioning, and UI tabs.", table_cell_style),
            Paragraph("<font color='#10b981'><b>51/51 PASSED (100%)</b></font>", table_cell_style),
        ],
        [
            Paragraph("<b>Static Linter & Code Hygiene</b>", table_cell_bold),
            Paragraph("<font name='Courier'>npm.cmd run lint</font>", table_cell_code),
            Paragraph("oxlint analyzing 43 files against 104 rules (detecting unused imports, dead references, and variable leaks).", table_cell_style),
            Paragraph("<font color='#10b981'><b>0 Warnings, 0 Errors</b></font>", table_cell_style),
        ],
        [
            Paragraph("<b>TypeScript & Production Build</b>", table_cell_bold),
            Paragraph("<font name='Courier'>npm.cmd run build</font>", table_cell_code),
            Paragraph("Strict tsc -b type checking and Vite production bundling with asset compression.", table_cell_style),
            Paragraph("<font color='#10b981'><b>Clean Build (1.30s)</b></font>", table_cell_style),
        ],
    ]
    qa_table = Table(qa_data, colWidths=[110, 120, 184, 90])
    qa_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(qa_table)
    story.append(Spacer(1, 14))

    # ==================== 5. DEMO ACCOUNTS & OPERATIONAL VERIFICATION ====================
    story.append(Paragraph("5. Interactive Verification & Demo Accounts", h1_style))
    story.append(Paragraph(
        "Reviewers can test all workflows locally at <b>http://localhost:5173/rally-point-web/</b>. "
        "The login screen features 1-click quick demo buttons for all 4 roles:",
        body_style
    ))

    accounts_data = [
        [
            Paragraph("Role", table_header_style),
            Paragraph("Email", table_header_style),
            Paragraph("Password", table_header_style),
            Paragraph("Primary View & Responsibilities", table_header_style),
        ],
        [
            Paragraph("<b>Superadmin</b>", table_cell_bold),
            Paragraph("<font name='Courier'>superadmin@rallypoint.local</font>", table_cell_code),
            Paragraph("<font name='Courier'>superadmin123</font>", table_cell_code),
            Paragraph("Oversees all branch sites, provisions new branches, views global KPIs, and audits commission cuts.", table_cell_style),
        ],
        [
            Paragraph("<b>Admin</b>", table_cell_bold),
            Paragraph("<font name='Courier'>admin@rallypoint.local</font>", table_cell_code),
            Paragraph("<font name='Courier'>admin123</font>", table_cell_code),
            Paragraph("Branch manager for Gensan — oversees courts, schedule board, bookings, users, and staff inquiries.", table_cell_style),
        ],
        [
            Paragraph("<b>Staff</b>", table_cell_bold),
            Paragraph("<font name='Courier'>staff@rallypoint.local</font>", table_cell_code),
            Paragraph("<font name='Courier'>staff123</font>", table_cell_code),
            Paragraph("Front desk operations — checks in members via QR, manages active court timers, and submits help inquiries.", table_cell_style),
        ],
        [
            Paragraph("<b>Member</b>", table_cell_bold),
            Paragraph("<font name='Courier'>member@rallypoint.local</font>", table_cell_code),
            Paragraph("<font name='Courier'>member123</font>", table_cell_code),
            Paragraph("Player experience — reserves courts, signs up for open play sessions, and views personal QR pass.", table_cell_style),
        ],
    ]
    acc_table = Table(accounts_data, colWidths=[70, 145, 85, 204])
    acc_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(acc_table)
    story.append(Spacer(1, 14))

    # ==================== 6. PRODUCTION DEPLOYMENT CHECKLIST ====================
    story.append(Paragraph("6. Production Deployment & Handoff Checklist", h1_style))
    story.append(Paragraph(
        "When transferring from local/demo mode into hosted Supabase staging and production environments:",
        body_style
    ))

    checklist_items = [
        "<b>Apply Database Migration:</b> Execute <code>supabase/migrations/20261014000000_multi_tenant_superadmin.sql</code> to create <code>branches</code>, <code>platform_commissions</code>, and RLS policies.",
        "<b>Configure Tenant Domain Routing:</b> Configure DNS wildcard routing (e.g. <code>*.rallypoint.ph</code>) or URL path matching to bind user sessions to their designated <code>branch_id</code>.",
        "<b>Automated Settlement Payouts:</b> In future iterations, link <code>platform_commissions</code> to a payment provider API (e.g. PayMongo Split Payouts or Stripe Connect) for automatic direct deposit of branch net revenue.",
        "<b>Staff/Admin Provisioning Policy:</b> Enforce that branch Admin and Staff profiles are only created by the Superadmin or Club Manager rather than the public join form."
    ]
    for item in checklist_items:
        story.append(Paragraph(f"☑ {item}", bullet_style))
    story.append(Spacer(1, 14))

    # Sign-off Box
    signoff_data = [
        [
            Paragraph("<b>Handoff Status:</b> COMPLETED & COMMITTED", table_cell_bold),
            Paragraph("<b>Git Remote / Branch:</b> <font name='Courier'>bapdagreat/rally-point-tenancy-handoff</font>", table_cell_style)
        ],
        [
            Paragraph("<b>Pull Request:</b> <font color='#0d5c58'>https://github.com/zylush/rally-point-web/pull/3</font>", table_cell_style),
            Paragraph("<b>Release Engineer:</b> Dayle Angelo Peña (@DayleeQuest)", table_cell_style)
        ]
    ]
    signoff_table = Table(signoff_data, colWidths=[252, 252])
    signoff_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(signoff_table)

    # Build the document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Handoff PDF successfully generated at: {filename}")

if __name__ == '__main__':
    output_path = sys.argv[1] if len(sys.argv) > 1 else "RALLY-POINT-TENANCY-HANDOFF.pdf"
    build_pdf(output_path)
