from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from community.models import Answer, Flag, Question, Room, Tag, Vote

User = get_user_model()
BASE = '/api/v1/community'


def make_user(name, role='student'):
    return User.objects.create_user(username=name, email=f'{name}@x.edu', password='pw-Test-12345', role=role)


class CommunityAPITests(APITestCase):
    def setUp(self):
        self.asha, self.ben, self.teacher = make_user('asha'), make_user('ben'), make_user('prof', 'teacher')
        self.room = Room.objects.create(name='ML Circle', slug='ml-circle', kind='course')
        self.q = Question.objects.create(room=self.room, title='What is PCA?', content='Explain', author=self.asha)

    def login(self, user):
        self.client.force_authenticate(user)

    # --- voting
    def test_vote_toggle_switch_and_counts(self):
        self.login(self.ben)
        r = self.client.post(f'{BASE}/questions/{self.q.id}/vote/', {'vote_type': 'upvote'})
        self.assertEqual((r.data['upvote_count'], r.data['user_vote']), (1, 'upvote'))
        r = self.client.post(f'{BASE}/questions/{self.q.id}/vote/', {'vote_type': 'downvote'})
        self.assertEqual((r.data['upvote_count'], r.data['downvote_count'], r.data['user_vote']), (0, 1, 'downvote'))
        r = self.client.post(f'{BASE}/questions/{self.q.id}/vote/', {'vote_type': 'downvote'})
        self.assertEqual((r.data['vote_score'], r.data['user_vote']), (0, None))
        self.assertEqual(Vote.objects.count(), 0)

    def test_cannot_vote_own_post_or_invalid_type(self):
        self.login(self.asha)
        self.assertEqual(self.client.post(f'{BASE}/questions/{self.q.id}/vote/', {'vote_type': 'upvote'}).status_code, 400)
        self.login(self.ben)
        self.assertEqual(self.client.post(f'{BASE}/questions/{self.q.id}/vote/', {'vote_type': 'sideways'}).status_code, 400)

    def test_anonymous_cannot_vote(self):
        self.assertEqual(self.client.post(f'{BASE}/questions/{self.q.id}/vote/', {'vote_type': 'upvote'}).status_code, 401)

    # --- N+1 regression (MU-CONNECT ran several queries per row)
    def test_list_query_count_does_not_grow_with_rows(self):
        self.login(self.ben)

        def populate(n):
            for i in range(n):
                q = Question.objects.create(room=self.room, title=f'Q{i}', author=self.asha)
                Answer.objects.create(question=q, author=self.ben, content='a')
                Vote.objects.create(voter=self.ben, question=q, value=1)

        populate(2)
        with self.assertNumQueries(3):  # count, annotated page, tags prefetch
            self.client.get(f'{BASE}/questions/')
        populate(15)
        with self.assertNumQueries(3):  # same cost with 8x the rows
            r = self.client.get(f'{BASE}/questions/')
        self.assertEqual(r.data['count'], 18)
        self.assertEqual(r.data['results'][0]['answer_count'], 1)

    # --- create with free-text tags, tag usage count
    def test_create_with_tags_and_usage_count(self):
        self.login(self.ben)
        r = self.client.post(f'{BASE}/questions/', {'title': 'Why SVM?', 'room': 'ml-circle', 'kind': 'question', 'tag_names': ['SVM', 'ML']}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(sorted(r.data['tags']), ['ML', 'SVM'])
        self.assertEqual(Tag.objects.get(slug='svm').usage_count, 1)
        self.client.patch(f'{BASE}/questions/{r.data["id"]}/', {'tag_names': ['ML']}, format='json')
        self.assertEqual(Tag.objects.get(slug='svm').usage_count, 0)

    # --- answers
    def test_only_author_or_teacher_can_accept_and_it_toggles(self):
        a = Answer.objects.create(question=self.q, author=self.ben, content='Dimensionality reduction')
        self.login(self.ben)
        self.assertEqual(self.client.post(f'{BASE}/answers/{a.id}/accept/').status_code, 403)
        self.login(self.asha)
        self.assertTrue(self.client.post(f'{BASE}/answers/{a.id}/accept/').data['is_accepted'])
        self.q.refresh_from_db()
        self.assertTrue(self.q.is_solved)
        self.assertFalse(self.client.post(f'{BASE}/answers/{a.id}/accept/').data['is_accepted'])

    def test_only_teacher_can_verify(self):
        a = Answer.objects.create(question=self.q, author=self.ben, content='x')
        self.login(self.asha)
        self.assertEqual(self.client.post(f'{BASE}/answers/{a.id}/verify/').status_code, 403)
        self.login(self.teacher)
        self.assertTrue(self.client.post(f'{BASE}/answers/{a.id}/verify/').data['is_faculty_verified'])

    def test_cannot_edit_someone_elses_post(self):
        self.login(self.ben)
        self.assertEqual(self.client.patch(f'{BASE}/questions/{self.q.id}/', {'title': 'hacked'}).status_code, 403)

    # --- anonymity
    def test_anonymous_post_hides_author_except_from_owner_and_moderators(self):
        self.q.is_anonymous = True
        self.q.save()
        self.login(self.ben)
        self.assertEqual(self.client.get(f'{BASE}/questions/{self.q.id}/').data['author']['full_name'], 'Anonymous')
        self.login(self.asha)
        self.assertEqual(self.client.get(f'{BASE}/questions/{self.q.id}/').data['author']['username'], 'asha')
        self.login(self.teacher)
        self.assertEqual(self.client.get(f'{BASE}/questions/{self.q.id}/').data['author']['username'], 'asha')

    # --- moderation
    @override_settings(FLAG_HIDE_THRESHOLD=2)
    def test_flags_auto_hide_and_moderator_can_restore(self):
        carol = make_user('carol')
        self.login(self.ben)
        self.assertEqual(self.client.post(f'{BASE}/questions/{self.q.id}/flag/', {'reason': 'spam'}).status_code, 201)
        self.assertEqual(self.client.post(f'{BASE}/questions/{self.q.id}/flag/', {'reason': 'spam'}).status_code, 409)  # duplicate
        self.login(carol)
        r = self.client.post(f'{BASE}/questions/{self.q.id}/flag/', {'reason': 'abuse'})
        self.assertTrue(r.data['auto_hidden'])
        self.login(make_user('dan'))
        self.assertEqual(self.client.get(f'{BASE}/questions/{self.q.id}/').status_code, 404)  # hidden from students
        self.login(self.teacher)
        flag = self.client.get(f'{BASE}/flags/?status=open').data['results'][0]
        self.assertEqual(self.client.post(f'{BASE}/flags/{flag["id"]}/resolve/', {'decision': 'remove'}).status_code, 200)
        self.q.refresh_from_db()
        self.assertTrue(self.q.is_hidden)
        self.assertEqual(Flag.objects.filter(status='open').count(), 0)

    def test_students_cannot_see_moderation_queue_or_stats(self):
        self.login(self.ben)
        self.assertEqual(self.client.get(f'{BASE}/flags/').status_code, 403)
        self.assertEqual(self.client.get(f'{BASE}/stats/').status_code, 403)
        self.login(self.teacher)
        self.assertEqual(self.client.get(f'{BASE}/stats/').data['posts_total'], 1)

    # --- views
    def test_view_count_once_per_viewer(self):
        self.login(self.ben)
        self.client.post(f'{BASE}/questions/{self.q.id}/view/')
        r = self.client.post(f'{BASE}/questions/{self.q.id}/view/')
        self.assertEqual(r.data['view_count'], 1)

    # --- rooms and filters
    def test_rooms_join_and_filter_posts_by_room(self):
        other = Room.objects.create(name='Other', slug='other')
        Question.objects.create(room=other, title='Elsewhere', author=self.asha)
        self.login(self.ben)
        self.client.post(f'{BASE}/rooms/ml-circle/join/')
        rooms = {r['slug']: r for r in self.client.get(f'{BASE}/rooms/').data['results']}
        self.assertTrue(rooms['ml-circle']['is_member'])
        self.assertEqual(rooms['ml-circle']['member_count'], 1)
        self.assertEqual(self.client.get(f'{BASE}/questions/?room=ml-circle').data['count'], 1)

    # --- comments
    def test_reply_must_belong_to_same_answer_and_one_level_only(self):
        a1 = Answer.objects.create(question=self.q, author=self.ben, content='1')
        a2 = Answer.objects.create(question=self.q, author=self.ben, content='2')
        self.login(self.asha)
        c = self.client.post(f'{BASE}/comments/', {'answer': a1.id, 'content': 'top'}, format='json').data
        self.assertEqual(self.client.post(f'{BASE}/comments/', {'answer': a2.id, 'parent': c['id'], 'content': 'x'}, format='json').status_code, 400)
        r = self.client.post(f'{BASE}/comments/', {'answer': a1.id, 'parent': c['id'], 'content': 'reply'}, format='json').data
        self.assertEqual(self.client.post(f'{BASE}/comments/', {'answer': a1.id, 'parent': r['id'], 'content': 'deep'}, format='json').status_code, 400)
