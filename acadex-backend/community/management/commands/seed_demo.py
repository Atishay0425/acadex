import os
import secrets

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils.text import slugify

from community.models import Answer, Question, Room, Tag, Vote

User = get_user_model()


class Command(BaseCommand):
    help = 'Create demo users, rooms and posts that mirror the front-end mock data (development only).'

    def handle(self, *args, **opts):
        pw = os.getenv('DEMO_PASSWORD')
        generated = not pw
        if generated:
            pw = secrets.token_urlsafe(12)  # no default password is stored in the repo
        people = [
            ('aarav', 'Aarav', 'Sharma', 'student', 'EN22CS301045', 'CSE'),
            ('riya', 'Riya', 'Patel', 'student', 'EN22CS301012', 'CSE'),
            ('kabir', 'Kabir', 'Singh', 'student', 'EN22CS301078', 'CSE'),
            ('ananya', 'Ananya', 'Das', 'student', 'EN22CS301033', 'CSE'),
            ('karan', 'Karan', 'Malhotra', 'student', 'EN21CS301008', 'CSE'),
            ('neha', 'Neha', 'Verma', 'teacher', None, 'CSE'),
            ('admin', 'Rakesh', 'Gupta', 'admin', None, ''),
        ]
        users = {}
        for username, fn, ln, role, enr, branch in people:
            u, created = User.objects.get_or_create(username=username, defaults=dict(
                email=f'{username}@college.edu', first_name=fn, last_name=ln, role=role, enrollment_id=enr, branch=branch, is_verified=True))
            if created:
                u.set_password(pw)
                u.is_staff = role == 'admin'
                u.save()
            users[username] = u

        rooms = {}
        for name, kind in [('ML Study Circle', 'course'), ('CSE Branch Lounge', 'branch'), ('Placement Prep', 'general'), ('Hackathons & Events', 'general')]:
            rooms[slugify(name)], _ = Room.objects.get_or_create(slug=slugify(name), defaults=dict(name=name, kind=kind))

        if Question.objects.exists():
            self.stdout.write('Posts already exist, skipping.')
            return
        data = [
            ('ml-study-circle', 'notes', 'riya', 'SVM kernel notes', 'Shared my handwritten notes for SVM kernels. Covers linear, polynomial and RBF with examples.', ['SVM', 'ML']),
            ('ml-study-circle', 'question', 'kabir', 'PCA numerical from the 2024 paper', 'Anyone solved the PCA numerical from the 2024 paper? Stuck on the eigenvector step.', ['PCA', 'ML']),
            ('cse-branch-lounge', 'event', 'ananya', 'Codeathon registration closes Friday', 'Reminder: Codeathon registration closes on Friday. Teams of 3.', ['Codeathon']),
            ('placement-prep', 'resource', 'karan', 'Top 60 OS and DBMS interview questions', 'Compiled 60 most-asked OS and DBMS questions from this season’s drives.', ['Placements', 'DBMS']),
        ]
        posts = []
        for room, kind, who, title, body, tags in data:
            q = Question.objects.create(room=rooms[room], kind=kind, title=title, content=body, author=users[who])
            for t in tags:
                tag, _ = Tag.objects.get_or_create(slug=slugify(t), defaults={'name': t})
                q.tags.add(tag)
            posts.append(q)
        ans = Answer.objects.create(question=posts[1], author=users['neha'], content='Compute the covariance matrix first, then solve det(C − λI) = 0 for eigenvalues; the eigenvector for the largest λ is PC1.', is_faculty_verified=True)
        posts[1].accepted_answer = ans
        posts[1].save()
        for who, q in [('aarav', 0), ('kabir', 0), ('riya', 1), ('aarav', 3), ('riya', 3)]:
            Vote.objects.get_or_create(voter=users[who], question=posts[q], defaults={'value': Vote.UP})
        self.stdout.write(self.style.SUCCESS('Seeded demo data. Logins: aarav / neha / admin.'))
        if generated:
            self.stdout.write(f'Generated demo password (shown once, set DEMO_PASSWORD to choose your own): {pw}')
