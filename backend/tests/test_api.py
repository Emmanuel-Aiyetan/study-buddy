import io
import unittest
import os
import httpx
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from pypdf import PdfWriter
import main


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def authorize(self):
        main.app.dependency_overrides[main.authenticated_user] = lambda: "student"

    def request(self):
        return dict(goal="Learn Python", today=date.today().isoformat(), deadline=(date.today()+timedelta(days=7)).isoformat(), study_time=1, knowledge_level="Beginner")

    def plan(self):
        return dict(title="Python", **self.request(), milestones=[dict(title="Basics", description="Learn syntax")], tasks=[dict(title="Practice", description="Write a function", scheduled_date=date.today().isoformat(), estimated_minutes=30)])

    def test_health_and_missing_auth(self):
        self.assertEqual(self.client.get('/health').json(), {"status": "ok"})
        self.assertEqual(self.client.post('/generate-plan', json=self.request()).status_code, 401)
        for path in ['/extract-pdf', '/generate-quiz', '/ask-tutor']:
            self.assertEqual(self.client.post(path).status_code, 401)

    def test_invalid_inputs(self):
        self.authorize()
        for overrides in [dict(study_time=-1), dict(goal="  "), dict(knowledge_level="invalid"), dict(deadline="2000-01-01")]:
            self.assertEqual(self.client.post('/generate-plan', json=self.request() | overrides).status_code, 422)

    def test_forged_token_is_rejected_and_provider_outage_is_safe(self):
        with patch.dict(os.environ, {'SUPABASE_URL': 'https://example.supabase.co', 'SUPABASE_PUBLISHABLE_KEY': 'public-key'}):
            for status, expected in [(401, 401), (500, 503)]:
                response = httpx.Response(status, request=httpx.Request('GET', 'https://example.supabase.co/auth/v1/user'))
                with patch('main.httpx.AsyncClient.get', new=AsyncMock(return_value=response)):
                    result = self.client.post('/generate-plan', json=self.request(), headers={'Authorization': 'Bearer forged'})
                    self.assertEqual(result.status_code, expected)

    def test_plan_contract_and_capacity(self):
        self.authorize()
        with patch('main.create_study_plan', return_value=self.plan()):
            response = self.client.post('/generate-plan', json=self.request())
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['study_plan']['tasks'][0]['estimated_minutes'], 30)
        bad = self.plan(); bad['tasks'][0]['estimated_minutes'] = 90
        with patch('main.create_study_plan', return_value=bad):
            self.assertEqual(self.client.post('/generate-plan', json=self.request()).status_code, 502)

    def test_no_exception_leaks(self):
        self.authorize()
        with patch('main.create_study_plan', side_effect=RuntimeError('SECRET-KEY')):
            response = self.client.post('/generate-plan', json=self.request())
            self.assertEqual(response.status_code, 502)
            self.assertNotIn('SECRET-KEY', response.text)

    def test_pdf_validation_and_size(self):
        self.authorize()
        for name, body, code in [('bad.txt', b'abc', 400), ('fake.pdf', b'abc', 400), ('large.pdf', b'%PDF-'+b'x'*main.MAX_PDF_BYTES, 413)]:
            response = self.client.post('/extract-pdf', files={'file': (name, body, 'application/pdf')})
            self.assertEqual(response.status_code, code)
        writer = PdfWriter(); writer.add_blank_page(width=100, height=100); stream=io.BytesIO(); writer.write(stream)
        self.assertEqual(self.client.post('/extract-pdf', files={'file': ('blank.pdf', stream.getvalue())}).status_code, 400)

    def test_analysis_quiz_and_tutor_contracts(self):
        self.authorize()
        with patch('main.pdf_text', new=AsyncMock(return_value='Some learning text')):
            with patch('main.analyze_study_material', return_value={'summary':'Summary','key_concepts':['A'],'focus_areas':['B']}):
                self.assertEqual(self.client.post('/extract-pdf', files={'file':('x.pdf', b'x')}).status_code, 200)
            with patch('main.generate_material_quiz', return_value={'title':'Invalid','questions':[]}):
                self.assertEqual(self.client.post('/generate-quiz', files={'file':('x.pdf', b'x')}).status_code, 502)
            with patch('main.ask_study_tutor', return_value='An explanation'):
                self.assertEqual(self.client.post('/ask-tutor', files={'file':('x.pdf', b'x')}, data={'question':'Explain A'}).json()['answer'], 'An explanation')

    def test_rate_limit(self):
        main.requests_by_user.clear()
        for _ in range(20): main.rate_limit('student')
        with self.assertRaises(main.HTTPException) as caught: main.rate_limit('student')
        self.assertEqual(caught.exception.status_code, 429)


if __name__ == '__main__':
    unittest.main()
